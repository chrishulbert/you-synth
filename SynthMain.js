let context = undefined
let node = undefined

const startSynth = async () => {
    if (context) { return } // No double-init.
    context = new AudioContext({
        sampleRate: 44100,
    });
    await context.audioWorklet.addModule('SynthProcessor.js');
    // await context.audioWorklet.addModule('SynthProcessor.js?cache=' + (new Date().getTime()));
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
        button.textContent = 'Playing...';
    } catch (err) {
        console.log(err)
        alert(err)
    }
}
const keysThatAreDown = {}
const onDown = async (midi) => {
    // if (!context) { await onStartButton() }
    if (keysThatAreDown[midi] === true) { return } // Already down, ignore key-repeat.
    node?.port.postMessage(`p,${midi}`)
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
    await onDown(parseInt(e.target.getAttribute('midi')))
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
    await onDown(midi)
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

document.addEventListener("DOMContentLoaded", async () => {
    // Set up the 'start' button.
    const button = document.getElementById('button-start')
    button.onclick = onStartButton
    button.disabled = false

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

    setCarrierWave(value) {
        this.carrierWave = value
        node?.port.postMessage(`s,carrierWave,${value}`)
    }
    setModulatorWave(value) {
        this.modulatorWave = value
        node?.port.postMessage(`s,modulatorWave,${value}`)
    }
    sendAllValuesAtStartup() {
        node?.port.postMessage(`s,carrierWave,${this.carrierWave}`)
        node?.port.postMessage(`s,modulatorWave,${this.modulatorWave}`)
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

const setupParameterUIOnLoad = () => {
    // Firstly apply the parameters to the UI.
    const carrierWave = document.getElementById('carrier-wave')
    const modulatorWave = document.getElementById('modulator-wave')
    carrierWave.value = waveCodeFromId(parameters.carrierWave)
    modulatorWave.value = waveCodeFromId(parameters.modulatorWave)

    // Now listen for changes.
    carrierWave.onchange = (e) => {
        parameters.setCarrierWave(waveIdFromCode(e.target.value))
    }
    modulatorWave.onchange = (e) => {
        parameters.setModulatorWave(waveIdFromCode(e.target.value))
    }
}
