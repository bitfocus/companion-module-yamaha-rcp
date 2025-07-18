## Yamaha Remote Control Protocol v3.5.11 - for Companion v3/4

**Available for the following Yamaha Pro Audio Devices**

- Rivage PM
- CL1/3/5
- QL1/5
- TF1/3/5
- TF-Rack
- DM3/7
- RIO 3224/1608 D1 and D2
- TIO 1608
- RSio64

**Available commands**

- Selected "set" commands
- Recall & Store Scenes

Please visit http://discourse.checkcheckonetwo.com for help, discussions, suggestions, etc.

_Andrew Broughton_

---

**REVISION HISTORY**

3.5.8

- Add Device Label variable
- Add Stereo Meter Presets

3.5.6

- Fix DM3 mute action

3.5.4

- Updated commands for DM7 firmware 1.60
- Fix for some strings not being quoted properly

3.5.3

- Fix incorrect Meter values for DM7
- Add Meter Presets for DM series

3.5.2

- Add new functions for DM3 Firmware v2
- Fix DM3 not retrieving Scene Name or Scene Comment
- Fix DM7 InCh count, make 120 instead of 72
- Add Support for RSio device
- Add KeepAlive parameter
- Add runmode and error reporting from device

3.4.10

- Bug fix when receiving partial message from Yamaha

3.4.3 - 3.4.9

- Meter fixes/improvements, add metering for Rivage

3.4.2

- Additional Meter support for devices other than RIO/TIO
- Added Meter offset for positioning
- Bug fixes

3.4.0

- Added Scene Store function (use with caution! - There's NO confirmation when storing or overwriting a scene)
- Added auto-detect RIO devices (bonjour)
- Level Meter support (functionality depends on device)

3.3.2

- Fixed min. Gain and HPF showing -Inf
- HPF on TIO/RIO now steps in same increments as device when using relative steps

3.3.1

- Bug fixes for Macro recording and DM7 Scene recalls
- Removed Toggle option for write-only actions
- Fix HPF Relative Actions for RIO and TIO

3.3.0

- Re-write of Message Handling & cleanup
- Added new commands for Rivage v6 firmware

3.2.3

- Support Cued Mixes in Actions & Additional Error Logging

3.2.2

- Add support for RIO and TIO preamps

3.2.0

- Add support for DM7 console

3.1.0

- Add support for DM3 console
- Add support for using variables in Strip Colors
- Initial support for actions on Cued Strips

3.0.5

- Fix name bug for Rivage

3.0.4

- Better handling of unexpected messages being returned from console

3.0.2

- Removed RecallInc/Dec for Rivage (not supported)
- Removed Cued Channel Variables for TF (not supported)
- Fix for getting Scene Info on Rivage & TF

3.0.1 Bug fixes

- Fixed module stopped responding if invalid values passed in actions
- Fixed an error when using RecallInc and RecallDec

3.0.0 Complete Rewrite for v3.

- more variable support, including new internal variables, custom variable support and auto-created internal variables
- Select "Auto-Create Variable" to create a variable in the form **CommandName_Ch#** or **CommandName_Ch#\_Mix#**
- Use **@(internal:custom_MyCustomVar)** in the value field to update a custom variable within a feedback. Custom variable must already exist.
- dB values are now entered as actual dB. Off is -Inf
- Added RecallInc (Recall next Scene) and RecallDec (Recall previous Scene) functions
