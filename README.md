## Yamaha Remote Control Protocol v3.0.0 - for Companion v3

**Available for the following Yamaha Pro Audio Devices**

- Rivage PM
- CL1/3/5
- QL1/5
- TF1/3/5
- TF-Rack

**Available commands**

- Selected "set" commands
- Recall Scenes

Please visit http://discourse.checkcheckonetwo.com for help, discussions, suggestions, etc.

_Andrew Broughton_

---

**REVISION HISTORY**

v3.0.0 Complete Rewrite for v3.
- more variable support, including new internal variables, custom variable support and auto-created internal variables
- Select "Auto-Create Variable" to create a variable in the form **CommandName_Ch#** or **CommandName_Ch#_Mix#**
- Use **@(internal:custom_MyCustomVar)** in the value field to update a custom variable within a feedback. Custom variable must already exist.
- dB values are now entered as actual dB. Off is -Inf
