
# homebridge-electrolux-broadlink-ac

Homebridge plugin for Electrolux (Kelvinator) Airconditioner models that use a Broadlink Module from the factory to provide WiFi or remote control via an app - Home Comfort

So far this is tested with the following:

* Kelvinator KSD50HWJ - Works

### Details

These ACs have a Broadlink Device type of 0x4f9b, and report their name as 'ELECTROLUX_OEM'.

As well as a different device type/ID, these also seem to have a different behaviour and packet strucutre to other Broadlink based ACs.

## Installation

1. This assumes you have homebrigdge installed and running.

2. Use the Home Comfort App to join your AC to your Wifi network.

3. If this plugin detects the AC but doesnt work, do the AC wifi setup again (hold down LED on the remote), but to *exit the App* when it asks you to name the aircon unit.

4. AC should show the Wifi symbol as solid.

5. From the Homebridge Web GUI, search for this plugin ie 'Electrolux'. There are no configurable options at this point so it should be simple.

This plugin should support multiple ACs on the same setwork because it will automatically discover and add them using the Broadlink Protocol Discovery, though i havent tested that in the real world.

Currently any devices that have a Broadlink ID other than 0x4f9b will be ignored. Future plan is to allow adding other device IDs that use the same protocol and data structure as these.

## Usage

### Issues

I not an experienced coder but if it doesnt work with your Electrolux or Kelvinator AC feel free to log an issue and I'll see what I can do. I cant guarantee I'll get to it fast let alone solve it. Thanks for your patience!

### Fan Speed

The Fan Speed within Apple Home for AC accessories is a percentage, but these ACs only have a few set Fan Speed settings.

This plugin maps the percentage to the 6 possible Fan Speed options:


| Fanspeed | AC equivalent |
|--------- | --------------|
| 0 - 19   | quiet         |
| 20 - 39  | low           |
| 40 - 59  | medium        |
| 60 - 79  | high          |
| 80 - 99  | turbo         |
| 100      | AUTO          |


### Temperatures

The AC cannot take a value outside 17-30 degrees celsius so these limitations are hard set for now.

### Fan Swing / Oscillate

Supports the native homekit switching the vertical swing on and off

### Things not implemented

No timer, sleep, 

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

* On the homeassistant.io boards, DotEfEkts' awesome Python extension to python-broadlink for Electrolux Devices

* Nigel Farina and all the devs of [`Homebridge`](homebridge.io)

All the Devs of these plugins:

* [`python-broadlink`](https://github.com/mjg59/python-broadlink]) Used with the electrolux.py to look at the json and see what was possible.

* [`broadlink-dissector`](https://github.com/csabavirag/broadlink-dissector) Used this to look at the packets on the network and check I had my packet-building code right

* [`homebridge-broadlink-heater-cooler`](https://github.com/makleso6/homebridge-broadlink-heater-cooler) Borrowed some structure and code ideas

* [`node-broadlink`](https://github.com/ThomasTavernier/node-broadlink) Library used for the base Broadlink protocol

