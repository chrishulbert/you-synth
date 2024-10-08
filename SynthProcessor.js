const StateIdle = 0
const StateAttacking = 1
const StateDecaying = 2
const StateSustaining = 3
const StateReleasing = 4
const WaveSine = 0
const WaveSquare = 1
const WaveTriangle = 2
const WaveSawtooth = 3

// Input is range 0..1
function valueForWave(type, x) {
    if (type == WaveSine) { return Math.sin(2 * Math.PI * x) }
    if (type == WaveSquare) { return 4. * Math.floor(x) - 2. * Math.floor(2. * x) + 1 }
    if (type == WaveTriangle) { return 2. * Math.abs(2. * (x + 0.25 - Math.floor(x + 0.75))) - 1. }
    if (type == WaveSawtooth) { return 2. * (x - Math.floor(x + 0.5)) }
    return 0
}

const SampleRate = 44100

class Envelope {
    state = StateIdle
    attack = 0.01 // Seconds
    decay = 0.2 // Seconds
    sustain = 0.5 // % of volume
    release = 0.5 // Seconds
    //attackPerFrame = 0
    value = 0

    next() {
        if (this.state == StateIdle) {
            // Nothing to do.
        } else if (this.state == StateAttacking) {
            const attackPerFrame = 1 / SampleRate / this.attack;
            const newValue = this.value + attackPerFrame;
            if (newValue >= 1) {
                this.value = 1.;
                this.state = StateDecaying;
            } else {
                this.value = newValue;
            }
        } else if (this.state == StateDecaying) {
            const decayPerFrame = (1 - this.sustain) / SampleRate / this.decay;
            const newValue = this.value - decayPerFrame;
            if (newValue <= this.sustain) {
                this.value = this.sustain;
                this.state = StateSustaining;
            } else {
                this.value = newValue;
            }
        } else if (this.state == StateSustaining) {
            // Do nothing, just remain at this level until the note is released.
        } else if (this.state == StateReleasing) {
            const releasePerFrame = 1 / SampleRate / this.release; // Not proportional to sustain in case sustain is eg 1% and they release at the peak, it'll take forever to decay.
            const newValue = this.value - releasePerFrame;
            if (newValue <= 0) {
                this.value = 0.;
                this.state = StateIdle;
            } else {
                this.value = newValue;
            }
        }
    }
}

class Voice {
    amplitude = 0
    cycle = 0
    carrierEnvelope = new Envelope()
    carrierFrequency = 440
    carrierWave = WaveSine
    modulatorEnvelope = new Envelope()
    modulatorFrequency = 440
    modulatorMultiple = 4
    modulatorWave = WaveSquare
    modulatorAmplitude = 0.5
    midiNote = 0

    release() {
        if (this.carrierEnvelope.state != StateIdle) {
            this.carrierEnvelope.state = StateReleasing
        }
        if (this.modulatorEnvelope.state != StateIdle) {
            this.modulatorEnvelope.state = StateReleasing
        }
    }

    play(midiNote, velocity) {
        this.midiNote = midiNote
        this.amplitude = velocity
        this.cycle = 0;
        this.modulatorEnvelope.value = 0
        this.modulatorEnvelope.state = StateAttacking
        this.carrierEnvelope.value = 0
        this.carrierEnvelope.state = StateAttacking
        this.carrierFrequency = 440 * Math.pow(2, (midiNote - 69) / 12)
        this.modulatorFrequency = this.carrierFrequency * this.modulatorMultiple
    }

    nextOutput() {
        if (this.carrierEnvelope.state == StateIdle) { return 0 } // Efficient early exit for the idle case.

        // Get the value before the updates so there's no 'click' from the first value being 1 instead of 0.
        const time = this.cycle / SampleRate;
        const modulatorDelta = valueForWave(this.modulatorWave, this.modulatorFrequency * time)
            * this.modulatorEnvelope.value * this.modulatorAmplitude;
        const value = valueForWave(this.carrierWave, this.carrierFrequency * time + modulatorDelta)
            * this.carrierEnvelope.value * this.amplitude;

        // Do updates.
        this.cycle++;
        this.carrierEnvelope.next()
        this.modulatorEnvelope.next()

        return value
    }
}

class SynthProcessor extends AudioWorkletProcessor {
    voices = []

    constructor() {
        super()
        for (let i=0; i<10; i++) {
            this.voices.push(new Voice())
        }
        this.port.onmessage = (e) => {
            const parts = e.data.split(',')
            const command = parts[0]
            if (command == 'p') {
                this.play(parseInt(parts[1]), parseFloat(parts[2]))
            } else if (command == 'r') {
                this.release(parseInt(parts[1]))
            } else if (command == 'ra') {
                this.releaseAll()
            } else if (command == 's') {
                this.setParameter(parts[1], parts[2])
            }
        }
    }

    setParameter(which, value) {
        if (which == 'carrierWave') {
            this.voices.forEach(v => v.carrierWave = parseInt(value))
        } else if (which == 'modulatorWave') {
            this.voices.forEach(v => v.modulatorWave = parseInt(value))
        } else if (which == 'carrierAttack') {
            this.voices.forEach(v => v.carrierEnvelope.attack = parseFloat(value))
        } else if (which == 'modulatorAttack') {
            this.voices.forEach(v => v.modulatorEnvelope.attack = parseFloat(value))
        } else if (which == 'carrierDecay') {
            this.voices.forEach(v => v.carrierEnvelope.decay = parseFloat(value))
        } else if (which == 'modulatorDecay') {
            this.voices.forEach(v => v.modulatorEnvelope.decay = parseFloat(value))
        } else if (which == 'carrierSustain') {
            this.voices.forEach(v => v.carrierEnvelope.sustain = parseFloat(value))
        } else if (which == 'modulatorSustain') {
            this.voices.forEach(v => v.modulatorEnvelope.sustain = parseFloat(value))
        } else if (which == 'carrierRelease') {
            this.voices.forEach(v => v.carrierEnvelope.release = parseFloat(value))
        } else if (which == 'modulatorRelease') {
            this.voices.forEach(v => v.modulatorEnvelope.release = parseFloat(value))
        } else if (which == 'modulatorMultiple') {
            this.voices.forEach(v => v.modulatorMultiple = parseFloat(value))
        } else if (which == 'modulatorAmplitude') {
            this.voices.forEach(v => v.modulatorAmplitude = parseFloat(value))
        }
    }

    // Find the free-est voice, eg one thats not playing, or oldest one.
    freeestVoice() {
        for (let v of this.voices) {
            if (v.carrierEnvelope.state == StateIdle) {
                return v
            }
        }
        let oldestCycle = 0
        let oldestVoice = undefined
        for (let v of this.voices) {
            if (v.cycle > oldestCycle) {
                oldestCycle = v.cycle
                oldestVoice = v
            }
        }
        return oldestVoice
    }

    play(midiNote, velocity) {
        this.freeestVoice().play(midiNote, velocity)
    }

    release(midiNote) {
        for (let v of this.voices) {
            if (v.midiNote == midiNote) {
                v.release()
            }
        }
    }

    releaseAll() {
        for (let v of this.voices) {
            v.release()
        }
    }

    process(inputs, outputs) {
        const output = outputs[0] // Assume one output.
        const channel = output[0] // Assume one channel, mono.
        const len = channel.length
        for (let i = 0; i<len; i++) {
            let sum = 0
            for (let v of this.voices) {
                sum += v.nextOutput()
            }
            channel[i] = sum * 0.2
        }
        return true
    }

}

registerProcessor('synthProcessor', SynthProcessor)
