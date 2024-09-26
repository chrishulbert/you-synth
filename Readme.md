# YouSynth

A simple FM Synthesizer, where all parameters are customisable.

Intended for a certain school teacher who complained all their students' instrument samples sounded identical :)

## MIDI

To use MIDI, HTTPS is essential. When developing, use Caddy to get https, like so:

* Install caddy: brew install caddy
    * Downloads from the caddyserver.com site/github don't seem to work.
* To host locally with https, run this from the same folder as index.html:
    * caddy file-server --domain localhost
    * It might ask for password for setting up the certs
* Then open https://localhost in browser, should be ok
