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
        button.textContent = 'Started...';
    } catch (err) {
        console.log(err)
        alert(err)
    }
}
const keysThatAreDown = {}
const onDown = async (midi) => {
    if (!context) { await onStartButton() } // Auto-start.
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

    setCarrierWave(value) {
        this.carrierWave = value
        node?.port.postMessage(`s,carrierWave,${value}`)
    }
    setModulatorWave(value) {
        this.modulatorWave = value
        node?.port.postMessage(`s,modulatorWave,${value}`)
    }
    setCarrierAttack(value) {
        this.carrierAttack = value
        node?.port.postMessage(`s,carrierAttack,${value}`)
    }
    setModulatorAttack(value) {
        this.modulatorAttack = value
        node?.port.postMessage(`s,modulatorAttack,${value}`)
    }
    setCarrierDecay(value) {
        this.carrierDecay = value
        node?.port.postMessage(`s,carrierDecay,${value}`)
    }
    setModulatorDecay(value) {
        this.modulatorDecay = value
        node?.port.postMessage(`s,modulatorDecay,${value}`)
    }
    setCarrierSustain(value) {
        this.carrierSustain = value
        node?.port.postMessage(`s,carrierSustain,${value}`)
    }
    setModulatorSustain(value) {
        this.modulatorSustain = value
        node?.port.postMessage(`s,modulatorSustain,${value}`)
    }
    setCarrierRelease(value) {
        this.carrierRelease = value
        node?.port.postMessage(`s,carrierRelease,${value}`)
    }
    setModulatorRelease(value) {
        this.modulatorRelease = value
        node?.port.postMessage(`s,modulatorRelease,${value}`)
    }
    setModulatorMultiple(value) {
        this.modulatorMultiple = value
        node?.port.postMessage(`s,modulatorMultiple,${value}`)
    }
    setModulatorAmplitude(value) {
        this.modulatorAmplitude = value
        node?.port.postMessage(`s,modulatorAmplitude,${value}`)
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
    const randomise = document.getElementById('randomise')

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
    modulatorMultiple.value = 8 + (parameters.modulatorMultiple * 2)
    modulatorMultipleLabel.textContent = `${parameters.modulatorMultiple}x`
    modulatorAmplitude.value = parameters.modulatorAmplitude
    modulatorAmplitudeLabel.textContent = `${(parameters.modulatorAmplitude * 100).toFixed(0)}%`

    // Now listen for changes.
    carrierWave.onchange = (e) => {
        parameters.setCarrierWave(waveIdFromCode(e.target.value))
    }
    modulatorWave.onchange = (e) => {
        parameters.setModulatorWave(waveIdFromCode(e.target.value))
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
    const rawMultipleToValueAndDisplay = (raw) => {
        if (raw >= 10) {
            const value = (raw - 8) / 2
            return {
                value,
                displayValue: `${value}x`,
            }
        } else {
            return {
                value: 1 / (11 - raw),
                displayValue: `1/${11 - raw}x`,
            }
        }
    }
    modulatorMultiple.oninput = (e) => {
        const rawValue = parseFloat(e.target.value)
        const { value, displayValue } = rawMultipleToValueAndDisplay(rawValue)
        parameters.setModulatorMultiple(value)
        modulatorMultipleLabel.textContent = `${displayValue}`
    }
    modulatorAmplitude.oninput = (e) => {
        parameters.setModulatorAmplitude(parseFloat(e.target.value))
        modulatorAmplitudeLabel.textContent = `${(parameters.modulatorAmplitude * 100).toFixed(0)}%`
    }
    randomise.onclick = (e) => {
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
