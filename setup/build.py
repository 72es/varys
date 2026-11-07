#!/usr/bin/env python3
"""Assemble index.html from setup/shell.html + setup/app.js. Feedback URL comes from setup/config.json."""
import json, pathlib
R=pathlib.Path(__file__).resolve().parent.parent
cfg=json.load(open(R/'setup/config.json'))
app=(R/'setup/app.js').read_text().replace('__FEEDBACK_URL__',cfg.get('feedback_url',''))
(R/'index.html').write_text((R/'setup/shell.html').read_text().replace('/*APP*/',app))
print('index.html built')
