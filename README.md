
# Electrolux Broadlink Airconditioner Plugin for Homebridge

For Electrolux Family ACs that use the Broadlink module internally. This includes Kelvinator brand too

These have a broadlink device type of 0x4f9b. Most broadlink plugins dont support these, plus it seems the api is different, in that it is all JSON based

## Installation

This assumes you have homebrigdge installed and running

From the GUI, search for this plugin ie 'Electrolux'. There are no configurable options at this point so it should be simple.

This should support multiple ACs on the same setwork because it will Automatically discover and add them, though the code to identify them may be incomplete.

Any devices that have a Broadlink ID other than 0x4f9b will be ignored.

## Usage

### Fan Speed

The Fan Speed within Apple Home for this type of accessory is a percentage, so this maps the percentage to the 6 possible Fan Speed options:

* `0-19%`  Quiet Mode
* `20-39%` Low
* `40-59%` Med
* `60-79%` High
* `80-99%` Turbo
* `100%`   Auto

### Temperatures

The AC cannot take a value outside 17-30 degrees celsius.

### Fan Swing / Oscillate

Supports switching the vertical swing on and off

### Timer

No timer support yet

### Auto, Display and Self Clean buttons

As well as the base AC device, this Plugin adds 3 Switches:

* `AUTO` Enabling this will set both AC mode and Fan Speed to Auto. This switch should update and reflect as being *Off* once either Mode or Fan speed is set to a non-Auto setting
* `LED Display` Controls whether the LED Display is enabled or not. On my Kelvinator KSD50HWJ, the Beep setting is tied to this, so this switch will control both the LED Display and Beep.
* `LED Display` Enables the Self Clean function, known internally within the AC as Mould Proof


## Other

### To do

more documentation

allow other device types or setting of variables

### Operation

Any time a command is sent to the AC, it returns a JSON string with all parameters. When Homekit sends get requests it sends a bunch.

Not really knowing how to code, I created a 200ms timer and a rudimentary cache, so if a response has come back and updated the cache in the last 200ms, the request for info will just read from cache.

This is to avoid a storm of requests and avoid slowing down homebridge. IDeally id like to make better use of Typescript/Javascript promises, but hey, im an amateur.

### Credits

On the homeassistant.io boards, DotEfEkts' awesome Python extension to python-broadlink

Nigel Farina and all the devs of [`Homebridge`](homebridge.io)

All the Devs of these plugins:

[`python-broadlink`](https://github.com/mjg59/python-broadlink])

[`broadlink-dissector`](https://github.com/csabavirag/broadlink-dissector)

[`homebridge-broadlink-heater-cooler`](https://github.com/makleso6/homebridge-broadlink-heater-cooler)

[`node-broadlink`](https://github.com/ThomasTavernier/node-broadlink)
