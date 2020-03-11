# node-vscp-helper

<img src="https://vscp.org/images/logo.png" width="100">

Utility and helper functions for VSCP applications

If you are new to VSCP you can find more info [here](https://www.vscp.org).


## Install

**NOT!** This module needs the [VSCP helper library](https://github.com/grodansparadis/vscp-helper-lib), so before use you must install this library. Instructions are [here](https://github.com/grodansparadis/vscp-helper-lib).

Install with

```bash
npm install node-vscp-helper
```

optionally with '--save' to save dependency in the package.json file.

## Usage

Reference the module in the beginning of your file like this

```javascript
const vscphlp = require("node-vscp-helper");
```

if you want to work with constants instead of _magical numbers_ then the vscp-class and vscp-type module is also useful. Bring them all in like this

```javascript
const vscp_class = require('node-vscp-class');
const vscp_type = require('node-vscp-type');

const vscp = require("node-vscp");
```



---

This package is part of the [VSCP(Very Simple Control Protocol)](https://www.vscp.org) IoT framework.





