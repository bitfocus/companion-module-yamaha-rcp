## Yamaha Remote Control Protocol v3.3.2 - for Companion v3

**Available for the following Yamaha Pro Audio Devices**

- Rivage PM
- CL1/3/5
- QL1/5
- TF1/3/5
- TF-Rack
- DM3/7
- RIO 3224/1608 D1 and D2
- TIO 1608

**Available commands**

- Selected "set" commands
- Recall Scenes

Please visit http://discourse.checkcheckonetwo.com for help, discussions, suggestions, etc.

_Andrew Broughton_

---

**REVISION HISTORY**

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

v3.0.0 Complete Rewrite for v3.
- more variable support, including new internal variables, custom variable support and auto-created internal variables
- Select "Auto-Create Variable" to create a variable in the form **CommandName_Ch#** or **CommandName_Ch#_Mix#**
- Use **@(internal:custom_MyCustomVar)** in the value field to update a custom variable within a feedback. Custom variable must already exist.
- dB values are now entered as actual dB. Off is -Inf
- Added RecallInc (Recall next Scene) and RecallDec (Recall previous Scene) functions
