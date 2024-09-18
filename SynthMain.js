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
    node.connect(context.destination);
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

document.addEventListener("DOMContentLoaded", async () => {
    const button = document.getElementById('button-start')
    button.onclick = onStartButton
    button.disabled = false
});

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
}
const keysThatAreDown = {}

document.addEventListener('keydown', async (event) => {
    // if (!context) { await onStartButton() }
    const midi = keysToMidi[event.key.toLowerCase()]
    if (!midi) { return } // Not one of the recognised keys
    if (keysThatAreDown[midi] === true) { return } // Already down, ignore key-repeat.
    node?.port.postMessage(`p,${midi}`)
    keysThatAreDown[midi] = true
});
document.addEventListener('keyup', (event) => {
    const midi = keysToMidi[event.key.toLowerCase()]
    if (!midi) { return } // Not one of the recognised keys
    node?.port.postMessage(`r,${midi}`)
    keysThatAreDown[midi] = false
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        node?.port.postMessage('ra')
    }
});
