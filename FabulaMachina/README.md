# FabulaMachina Project Overview

FabulaMachina is a Flask application for visualizing fac projects.

## About fac

fac is a build system for LLM based projects.

The config file `fac.yaml` defines "targets" at the top-level,
and the properties of these targets define how to build them.
Targets often have variable names inside of them which get substituted by the build system to generate paths in the filesystem.
For example, the target `characters/$CHARACTER/about.json` defines how to build the paths `characters/Didaskalos/about.json` and `characters/Dinosaur/about.json`.

A "collection" is a set of targets that exist in a common folder.
For example, the targets `characters/$CHARACTER/about.json` and `characters/$CHARACTER/character_sheet.png` would both be in the collection `characters/$CHARACTER/`.

## About FabulaMachina

The FabulaMachina system contains generic code for displaying any collection in a fac.yaml file and the "book" page that is specific to the file `../fac.yaml` which is a fac project for generating books/movies.
