let context = undefined
let node = undefined

const startSynth = async () => {
    if (context) { return } // No double-init.
    context = new AudioContext({
        sampleRate: 44100,
    });
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
