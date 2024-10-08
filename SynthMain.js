let context = undefined
let node = undefined
const sampleRate = 44100

const startSynth = async () => {
    if (context) { return } // No double-init.
    context = new AudioContext({ sampleRate });
    await context.audioWorklet.addModule('SynthProcessor.js');
    // await context.audioWorklet.addModule('SynthProcessor.js?developmentCacheBuster=' + (new Date().getTime()));
    node = new AudioWorkletNode(context, 'synthProcessor', { 
        numberOfInputs: 0,
        outputChannelCount: [1],
    });
    node.onprocessorerror = (err) => {
        console.log(err)
    }
    node.connect(context.destination)
    parameters.sendAllValuesAtStartup()
}

const onStartButton = async () => {
    const button = document.getElementById('button-start')
    button.disabled = true
    try {
        await startSynth()
        button.textContent = 'Started...';
    } catch (err) {
        console.log(err)
        alert(err)
    }
}
const keysThatAreDown = {}
const onDown = async (midi, velocity) => { // Velocity should be 0-1.
    if (!context) { await onStartButton() } // Auto-start.
    if (keysThatAreDown[midi] === true) { return } // Already down, ignore key-repeat.
    node?.port.postMessage(`p,${midi},${velocity.toFixed(2)}`)
    keysThatAreDown[midi] = true
    document.querySelector(`.key[midi="${midi}"]`)?.classList.add('on')
}
const onUp = (midi) => {
    if (!keysThatAreDown[midi]) { return } // Already up, ignore mouseup-repeat.
    node?.port.postMessage(`r,${midi}`)
    keysThatAreDown[midi] = false
    document.querySelector(`.key[midi="${midi}"]`)?.classList.remove('on')
}

const onKeyboardMouseDown = async (e) => {
    await onDown(parseInt(e.target.getAttribute('midi')), 1)
}
const onKeyboardMouseUp = (e) => {
    onUp(parseInt(e.target.getAttribute('midi')))
}

// Middle row of querty starts with c4, with sharps on the row above.
const keysToMidi = {
    'a': 60, // C4
    'w': 61, // C#4
    's': 62, // D4
    'e': 63, // D#4
    'd': 64, // E4
    'f': 65, // F4
    't': 66, // F#4
    'g': 67, // G4
    'y': 68, // G#4
    'h': 69, // A4
    'u': 70, // A#4
    'j': 71, // B4
    'k': 72, // C5
    'o': 73, // C#5
    'l': 74, // D5
    'p': 75, // D#5
    ';': 76, // E5
    ':': 76, // E5
}
document.addEventListener('keydown', async (event) => {
    const midi = keysToMidi[event.key.toLowerCase()]
    if (!midi) { return } // Not one of the recognised keys
    await onDown(midi, 1)
});
document.addEventListener('keyup', (event) => {
    const midi = keysToMidi[event.key.toLowerCase()]
    if (!midi) { return } // Not one of the recognised keys
    onUp(midi)
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        node?.port.postMessage('ra')
    }
});

const onAbout = () => {
    window.location.assign('https://www.splinter.com.au/2024/10/09/maths-of-fm-synthesis/')
}

const onShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      alert('This instrument and its parameters copied to the clipboard!');
    }).catch(err => {
      console.error('Error: ', err);
    })
}

const onMidiMessage = (event) => {
    // Event.data is a Uint8Array.
    if (event.data.length < 3) { return }
    const messageHighNibble = event.data[0] >> 4 // 9=note on, 8=note off.
    const note = event.data[1]; // middle c = 60.
    const velocity = event.data[2]; // 0=release, 1=softest, 60=usual press, 127=hardest.
    if (messageHighNibble == 9 && velocity > 0) { // Note on. 
        onDown(note, velocity / 127)
    } else if (messageHighNibble == 8 || (messageHighNibble == 9 && velocity == 0)) { // Note off.
        onUp(note)
    }
}

const onConnectMidi = async () => {
    try {
        if (!context) { await onStartButton() } // Auto-start.
        if (!navigator.requestMIDIAccess) {
            throw new Error('This browser does not support MIDI')
        }
        const midiAccess = await navigator.requestMIDIAccess()
        const status = await navigator.permissions.query({ name: 'midi' })
        if (status.state != 'granted') {
            throw new Error(`Permission not granted, instead it is: ${status.state}`)
        }
        if (midiAccess.inputs.size == 0) {
            throw new Error(`No MIDI keyboards are connected.`)
        }
        const names = []
        for (const [id, input] of midiAccess.inputs) {
            names.push(`${input.manufacturer} ${input.name}`)
            input.onmidimessage = onMidiMessage
        }
        const allNames = names.join(', ')
        alert(`Connected to ${allNames}`)
    } catch (err) {
        alert(err)
    }
}

// Things to do at startup time:
document.addEventListener("DOMContentLoaded", async () => {
    // Set up the 'start' button.
    const button = document.getElementById('button-start')
    button.onclick = onStartButton
    button.disabled = false

    // Setup share.
    document.getElementById('button-share').onclick = onShare
    document.getElementById('button-midi').onclick = onConnectMidi
    document.getElementById('button-download-wav').onclick = onDownloadWav
    document.getElementById('button-about').onclick = onAbout

    // Set up the keys.
    for (let k of document.getElementsByClassName('key')) {
        k.onmousedown = onKeyboardMouseDown
        k.onmouseup = onKeyboardMouseUp
        k.onmouseout = onKeyboardMouseUp
    }

    setupParameterUIOnLoad()
});

// -=[ The UI for customising the values ]=-

const WaveSine = 0
const WaveSquare = 1
const WaveTriangle = 2
const WaveSawtooth = 3
class Parameters {
    carrierWave = WaveSquare
    modulatorWave = WaveTriangle
    carrierAttack = 0.01
    modulatorAttack = 0.01
    carrierDecay = 0.2
    modulatorDecay = 0.2
    carrierSustain = 0.5
    modulatorSustain = 0.5
    carrierRelease = 0.5
    modulatorRelease = 0.5
    modulatorMultiple = 4
    modulatorAmplitude = 1

    constructor() {
        for (let kv of window.location.hash.slice(1).split('&')) {
            const [k, v] = kv.split('=')
            if (!!k && !!v) {
                if (k == 'cWave') { this.carrierWave = waveIdFromCode(v) }
                if (k == 'mWave') { this.modulatorWave = waveIdFromCode(v) }
                if (k == 'cAttack') { this.carrierAttack = parseFloat(v) }
                if (k == 'cDecay') { this.carrierDecay = parseFloat(v) }
                if (k == 'cSustain') { this.carrierSustain = parseFloat(v) }
                if (k == 'cRelease') { this.carrierRelease = parseFloat(v) }
                if (k == 'mAttack') { this.modulatorAttack = parseFloat(v) }
                if (k == 'mDecay') { this.modulatorDecay = parseFloat(v) }
                if (k == 'mSustain') { this.modulatorSustain = parseFloat(v) }
                if (k == 'mRelease') { this.modulatorRelease = parseFloat(v) }
                if (k == 'mMultiple') { this.modulatorMultiple = parseFloat(v) }
                if (k == 'mAmplitude') { this.modulatorAmplitude = parseFloat(v) }
            }
        }
    }

    setFragment() {
        window.location.hash = [
            `cWave=${waveCodeFromId(this.carrierWave)}`,
            `cAttack=${this.carrierAttack}`,
            `cDecay=${this.carrierDecay}`,
            `cSustain=${this.carrierSustain}`,
            `cRelease=${this.carrierRelease}`,
            `mWave=${waveCodeFromId(this.modulatorWave)}`,
            `mAttack=${this.modulatorAttack}`,
            `mDecay=${this.modulatorDecay}`,
            `mSustain=${this.modulatorSustain}`,
            `mRelease=${this.modulatorRelease}`,
            `mMultiple=${this.modulatorMultiple}`,
            `mAmplitude=${this.modulatorAmplitude}`,
        ].join('&')
    }
    setCarrierWave(value) {
        this.carrierWave = value
        node?.port.postMessage(`s,carrierWave,${value}`)
        this.setFragment()
    }
    setModulatorWave(value) {
        this.modulatorWave = value
        node?.port.postMessage(`s,modulatorWave,${value}`)
        this.setFragment()
    }
    setCarrierAttack(value) {
        this.carrierAttack = value
        node?.port.postMessage(`s,carrierAttack,${value}`)
        this.setFragment()
    }
    setModulatorAttack(value) {
        this.modulatorAttack = value
        node?.port.postMessage(`s,modulatorAttack,${value}`)
        this.setFragment()
    }
    setCarrierDecay(value) {
        this.carrierDecay = value
        node?.port.postMessage(`s,carrierDecay,${value}`)
        this.setFragment()
    }
    setModulatorDecay(value) {
        this.modulatorDecay = value
        node?.port.postMessage(`s,modulatorDecay,${value}`)
        this.setFragment()
    }
    setCarrierSustain(value) {
        this.carrierSustain = value
        node?.port.postMessage(`s,carrierSustain,${value}`)
        this.setFragment()
    }
    setModulatorSustain(value) {
        this.modulatorSustain = value
        node?.port.postMessage(`s,modulatorSustain,${value}`)
        this.setFragment()
    }
    setCarrierRelease(value) {
        this.carrierRelease = value
        node?.port.postMessage(`s,carrierRelease,${value}`)
        this.setFragment()
    }
    setModulatorRelease(value) {
        this.modulatorRelease = value
        node?.port.postMessage(`s,modulatorRelease,${value}`)
        this.setFragment()
    }
    setModulatorMultiple(value) {
        this.modulatorMultiple = value
        node?.port.postMessage(`s,modulatorMultiple,${value}`)
        this.setFragment()
    }
    setModulatorAmplitude(value) {
        this.modulatorAmplitude = value
        node?.port.postMessage(`s,modulatorAmplitude,${value}`)
        this.setFragment()
    }
    sendAllValuesAtStartup() {
        node?.port.postMessage(`s,carrierWave,${this.carrierWave}`)
        node?.port.postMessage(`s,modulatorWave,${this.modulatorWave}`)
        node?.port.postMessage(`s,carrierAttack,${this.carrierAttack}`)
        node?.port.postMessage(`s,modulatorAttack,${this.modulatorAttack}`)
        node?.port.postMessage(`s,carrierDecay,${this.carrierDecay}`)
        node?.port.postMessage(`s,modulatorDecay,${this.modulatorDecay}`)
        node?.port.postMessage(`s,carrierSustain,${this.carrierSustain}`)
        node?.port.postMessage(`s,modulatorSustain,${this.modulatorSustain}`)
        node?.port.postMessage(`s,carrierRelease,${this.carrierRelease}`)
        node?.port.postMessage(`s,modulatorRelease,${this.modulatorRelease}`)
        node?.port.postMessage(`s,modulatorMultiple,${this.modulatorMultiple}`)
        node?.port.postMessage(`s,modulatorAmplitude,${this.modulatorAmplitude}`)
    }
}
const parameters = new Parameters()
function waveIdFromCode(code) {
    if (code=='sine')     { return WaveSine }
    if (code=='square')   { return WaveSquare }
    if (code=='triangle') { return WaveTriangle }
    if (code=='sawtooth') { return WaveSawtooth }
    return WaveSine
}
function waveCodeFromId(id) {
    if (id==WaveSine)     { return 'sine' }
    if (id==WaveSquare)   { return 'square' }
    if (id==WaveTriangle) { return 'triangle' }
    if (id==WaveSawtooth) { return 'sawtooth' }
    return 'sine'
}
function randomWaveId() {
    return Math.round(Math.random() * WaveSawtooth)
}
function multipleDescription(x) {
    if (x >= 1) {
        return `${x}x`
    } else {
        return `1/${(1 / x).toFixed()}x`
    }
}
function multipleRangeValue(x) {
    if (x >= 1) {
        return 8 + (parameters.modulatorMultiple * 2)
    } else {
        return 11 - Math.round(1 / x)
    }
}
const setupParameterUIOnLoad = () => {
    // Get the DOM elements.
    const carrierWave = document.getElementById('carrier-wave')
    const modulatorWave = document.getElementById('modulator-wave')
    const carrierAttack = document.getElementById('carrier-attack')
    const modulatorAttack = document.getElementById('modulator-attack')
    const carrierAttackLabel = document.getElementById('carrier-attack-label')
    const modulatorAttackLabel = document.getElementById('modulator-attack-label')
    const carrierDecay = document.getElementById('carrier-decay')
    const modulatorDecay = document.getElementById('modulator-decay')
    const carrierDecayLabel = document.getElementById('carrier-decay-label')
    const modulatorDecayLabel = document.getElementById('modulator-decay-label')
    const carrierSustain = document.getElementById('carrier-sustain')
    const modulatorSustain = document.getElementById('modulator-sustain')
    const carrierSustainLabel = document.getElementById('carrier-sustain-label')
    const modulatorSustainLabel = document.getElementById('modulator-sustain-label')
    const carrierRelease = document.getElementById('carrier-release')
    const modulatorRelease = document.getElementById('modulator-release')
    const carrierReleaseLabel = document.getElementById('carrier-release-label')
    const modulatorReleaseLabel = document.getElementById('modulator-release-label')
    const modulatorMultiple = document.getElementById('modulator-multiple')
    const modulatorMultipleLabel = document.getElementById('modulator-multiple-label')
    const modulatorAmplitude = document.getElementById('modulator-amplitude')
    const modulatorAmplitudeLabel = document.getElementById('modulator-amplitude-label')
    const randomise = document.getElementById('button-randomise')

    // Firstly apply the parameters to the UI.
    carrierWave.value = waveCodeFromId(parameters.carrierWave)
    modulatorWave.value = waveCodeFromId(parameters.modulatorWave)
    carrierAttack.value = parameters.carrierAttack
    modulatorAttack.value = parameters.modulatorAttack
    carrierAttackLabel.textContent = `${parameters.carrierAttack}s`
    modulatorAttackLabel.textContent = `${parameters.modulatorAttack}s`
    carrierDecay.value = parameters.carrierDecay
    modulatorDecay.value = parameters.modulatorDecay
    carrierDecayLabel.textContent = `${parameters.carrierDecay}s`
    modulatorDecayLabel.textContent = `${parameters.modulatorDecay}s`
    carrierSustain.value = parameters.carrierSustain
    modulatorSustain.value = parameters.modulatorSustain
    carrierSustainLabel.textContent = `${parameters.carrierSustain * 100}%`
    modulatorSustainLabel.textContent = `${parameters.modulatorSustain * 100}%`
    carrierRelease.value = parameters.carrierRelease
    modulatorRelease.value = parameters.modulatorRelease
    carrierReleaseLabel.textContent = `${parameters.carrierRelease}s`
    modulatorReleaseLabel.textContent = `${parameters.modulatorRelease}s`
    modulatorMultiple.value = multipleRangeValue(parameters.modulatorMultiple)
    modulatorMultipleLabel.textContent = multipleDescription(parameters.modulatorMultiple)
    modulatorAmplitude.value = parameters.modulatorAmplitude
    modulatorAmplitudeLabel.textContent = `${(parameters.modulatorAmplitude * 100).toFixed(0)}%`

    // Now listen for changes.
    carrierWave.oninput = () => {
        parameters.setCarrierWave(waveIdFromCode(carrierWave.value))
    }
    modulatorWave.oninput = () => {
        parameters.setModulatorWave(waveIdFromCode(modulatorWave.value))
    }
    carrierAttack.oninput = (e) => {
        parameters.setCarrierAttack(parseFloat(e.target.value))
        carrierAttackLabel.textContent = `${parameters.carrierAttack}s`
    }
    modulatorAttack.oninput = (e) => {
        parameters.setModulatorAttack(parseFloat(e.target.value))
        modulatorAttackLabel.textContent = `${parameters.modulatorAttack}s`
    }
    carrierDecay.oninput = (e) => {
        parameters.setCarrierDecay(parseFloat(e.target.value))
        carrierDecayLabel.textContent = `${parameters.carrierDecay}s`
    }
    modulatorDecay.oninput = (e) => {
        parameters.setModulatorDecay(parseFloat(e.target.value))
        modulatorDecayLabel.textContent = `${parameters.modulatorDecay}s`
    }
    carrierSustain.oninput = (e) => {
        parameters.setCarrierSustain(parseFloat(e.target.value))
        carrierSustainLabel.textContent = `${parameters.carrierSustain * 100}%`
    }
    modulatorSustain.oninput = (e) => {
        parameters.setModulatorSustain(parseFloat(e.target.value))
        modulatorSustainLabel.textContent = `${parameters.modulatorSustain * 100}%`
    }
    carrierRelease.oninput = (e) => {
        parameters.setCarrierRelease(parseFloat(e.target.value))
        carrierReleaseLabel.textContent = `${parameters.carrierRelease}s`
    }
    modulatorRelease.oninput = (e) => {
        parameters.setModulatorRelease(parseFloat(e.target.value))
        modulatorReleaseLabel.textContent = `${parameters.modulatorRelease}s`
    }
    // Takes 0..20 inclusive, returns the value and display text.
    const rawMultipleToValue = (raw) => {
        if (raw >= 10) {
            return (raw - 8) / 2
        } else {
            return 1 / (11 - raw)
        }
    }
    modulatorMultiple.oninput = (e) => {
        const rawValue = parseFloat(e.target.value)
        const value = rawMultipleToValue(rawValue)
        parameters.setModulatorMultiple(value)
        modulatorMultipleLabel.textContent = multipleDescription(value)
    }
    modulatorAmplitude.oninput = (e) => {
        parameters.setModulatorAmplitude(parseFloat(e.target.value))
        modulatorAmplitudeLabel.textContent = `${(parameters.modulatorAmplitude * 100).toFixed(0)}%`
    }
    randomise.onclick = (e) => {
        carrierWave.value = waveCodeFromId(randomWaveId())
        carrierWave.oninput()
        modulatorWave.value = waveCodeFromId(randomWaveId())
        modulatorWave.oninput()
        carrierAttack.oninput({ target: { value: Math.round(200 * Math.random())/100 }})
        carrierAttack.value = parameters.carrierAttack
        modulatorAttack.oninput({ target: { value: Math.round(200 * Math.random())/100 }})
        modulatorAttack.value = parameters.modulatorAttack
        carrierDecay.oninput({ target: { value: Math.round(200 * Math.random())/100 }})
        carrierDecay.value = parameters.carrierDecay
        modulatorDecay.oninput({ target: { value: Math.round(200 * Math.random())/100 }})
        modulatorDecay.value = parameters.modulatorDecay
        carrierSustain.oninput({ target: { value: Math.round(10 * Math.random())/10 }})
        carrierSustain.value = parameters.carrierSustain
        modulatorSustain.oninput({ target: { value: Math.round(10 * Math.random())/10 }})
        modulatorSustain.value = parameters.modulatorSustain
        carrierRelease.oninput({ target: { value: Math.round(200 * Math.random())/100 }})
        carrierRelease.value = parameters.carrierRelease
        modulatorRelease.oninput({ target: { value: Math.round(200 * Math.random())/100 }})
        modulatorRelease.value = parameters.modulatorRelease
        modulatorAmplitude.oninput({ target: { value: Math.round(40 * Math.random())/10 }})
        modulatorAmplitude.value = parameters.modulatorAmplitude
        modulatorMultiple.value = Math.round(20 * Math.random())
        modulatorMultiple.oninput({ target: modulatorMultiple })
    }
}

// -=[ WAV file generation below ]=-

// Wraps raw data into a riff chunk.
const riffChunk = (data, name) => {
    const dataLen = data.length
    const riff = new Uint8Array(dataLen + 8)
    riff[0] = name.charCodeAt(0)
    riff[1] = name.charCodeAt(1)
    riff[2] = name.charCodeAt(2)
    riff[3] = name.charCodeAt(3)
    riff[4] = dataLen & 0xff
    riff[5] = (dataLen >> 8) & 0xff
    riff[6] = (dataLen >> 16) & 0xff
    riff[7] = (dataLen >> 24) & 0xff
    riff.set(data, 8)
    return riff
}
// The 'fmt' chunk in the wav file.
const waveFmt = () => {
    const bytesPerBlock = 2; // 16 bit mono.
    const bytesPerSecond = sampleRate * bytesPerBlock
    const fmt = new Uint8Array(16)
    fmt[0]=1; fmt[1]=0 // 1=PCM.
    fmt[2]=1; fmt[3]=0 // 1 channel.
    fmt[4]=sampleRate & 0xff
    fmt[5]=(sampleRate >> 8) & 0xff
    fmt[6]=(sampleRate >> 16) & 0xff
    fmt[7]=(sampleRate >> 24) & 0xff
    fmt[8]=bytesPerSecond & 0xff
    fmt[9]=(bytesPerSecond >> 8) & 0xff
    fmt[10]=(bytesPerSecond >> 16) & 0xff
    fmt[11]=(bytesPerSecond >> 24) & 0xff
    fmt[12]=bytesPerBlock & 0xff
    fmt[13]=(bytesPerBlock >> 8) & 0xff
    fmt[14]=16; fmt[15]=0 // Bits per sample.
    return fmt
}
// Creates the 'data' chunk for the wav file.
const waveData = () => {
    const floats = waveFloats()
    // Get the scale.
    let maxAmplitude = 0
    for (const x of floats) {
        if (Math.abs(x) > maxAmplitude) {
            maxAmplitude = Math.abs(x)
        }
    }
    // Start with ArrayBuffer because it has setInt16.
    const buf = new ArrayBuffer(floats.length * 2) // *2 because 16-bits.
    const view = new DataView(buf)
    floats.forEach((x, i) => {
        const i16 = x / maxAmplitude * 32767 // i16 range is -32768...32767
        view.setInt16(i * 2, i16, true) // true = little endian.
    })
    return new Uint8Array(buf)
}
// Creates a riff wav file out of the given fmt and data chunks.
const riffFile = (fmt, data) => {
    const riff = "RIFF"
    const wave = "WAVE"
    const reportedSize = fmt.length + data.length
    const arr = new Uint8Array(12 + fmt.length + data.length)
    arr[0] = riff.charCodeAt(0)
    arr[1] = riff.charCodeAt(1)
    arr[2] = riff.charCodeAt(2)
    arr[3] = riff.charCodeAt(3)
    arr[4] = reportedSize & 0xff
    arr[5] = (reportedSize >> 8) & 0xff
    arr[6] = (reportedSize >> 16) & 0xff
    arr[7] = (reportedSize >> 24) & 0xff
    arr[8] = wave.charCodeAt(0)
    arr[9] = wave.charCodeAt(1)
    arr[10] = wave.charCodeAt(2)
    arr[11] = wave.charCodeAt(3)
    arr.set(fmt, 12)
    arr.set(data, 12 + fmt.length)
    return arr
}
// Orchestrates making the chunks, wrapping them, combining to the riff wav file.
const generateWaveFile = () => {
    const fmtRiff = riffChunk(waveFmt(), 'fmt ')
    const dataRiff = riffChunk(waveData(), 'data')
    const file = riffFile(fmtRiff, dataRiff)
    return file
}
// Make the wav file sound as floats.
// Apologies, much of this is duplicated logic from SynthProcessor.js
// I couldn't think of a nice way of sharing code without making it super complex, plus
// there are some differences, so forgive me that this is a bit unnecessarily duplicated.
function waveFloats() {
    const tau = Math.PI * 2
    function valueForWave(type, x) {
        if (type == WaveSine) { return Math.sin(x * tau) }
        if (type == WaveSquare) { return 4. * Math.floor(x) - 2. * Math.floor(2. * x) + 1 }
        if (type == WaveTriangle) { return 2. * Math.abs(2. * (x + 0.25 - Math.floor(x + 0.75))) - 1. }
        if (type == WaveSawtooth) { return 2. * (x - Math.floor(x + 0.5)) }
        return 0
    }
    // Returns a function that takes time and emits amplitude.
    function envelope(attack, decay, sustainAmplitude, release, startReleasingTime) {
        const sustainDuration = startReleasingTime - (attack + decay)
        return (t) => {
            if (t <= attack) {
                return t / attack // Attacking.
            } else if (t <= attack + decay) {
                const progress = (t - attack) / decay
                return 1 - progress * (1 - sustainAmplitude) // Decaying.
            } else if (t <= attack + decay + sustainDuration) {
                return sustainAmplitude // Sustaining.
            } else { // Releasing.
                const releasingTime = (t - (attack + decay + sustainDuration))
                const releasedAmount = releasingTime / release
                return Math.max(0, // Dont let it go below 0.
                    sustainAmplitude - releasedAmount)
            }
        }
    }
    // To make them release at same time, figure out when each would like to release,
    // then release both at that later time.
    const niceSustainTime = 1
    const carrierReleaseTime = parameters.carrierAttack + parameters.carrierDecay + niceSustainTime
    const modulatorReleaseTime = parameters.modulatorAttack + parameters.modulatorDecay + niceSustainTime
    const startReleasingTime = Math.max(carrierReleaseTime, modulatorReleaseTime)
    const carrierEnvelope = envelope(parameters.carrierAttack, parameters.carrierDecay, parameters.carrierSustain, parameters.carrierRelease, startReleasingTime)
    const modulatorEnvelope = envelope(parameters.modulatorAttack, parameters.modulatorDecay, parameters.modulatorSustain, parameters.modulatorRelease, startReleasingTime)
    const duration = startReleasingTime + parameters.carrierRelease
    const samples = Math.ceil(duration * sampleRate)
    const midiNote = 60 // Middle C4
    const carrierFrequency = Math.pow(2, (midiNote - 69) / 12) * 440
    const modulatorFrequency = carrierFrequency * parameters.modulatorMultiple
    const wave = []
    for (let i=0; i<samples; i++) {
        const time = i / sampleRate
        const modulatorDelta = valueForWave(parameters.modulatorWave, modulatorFrequency * time)
            * modulatorEnvelope(time) * parameters.modulatorAmplitude;
        const value = valueForWave(parameters.carrierWave, carrierFrequency * time + modulatorDelta)
            * carrierEnvelope(time);
        wave.push(value)
    }
    return wave
}
function onDownloadWav() {
    const wave = generateWaveFile()
    const blob = new Blob([wave], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.style.display = 'none'
    link.href = url
    link.download = 'YouSynthSample.wav' // TODO bake the params into the filename one day?
    document.body.appendChild(link)
    link.click()
    // Tidy up to save memory:
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}
