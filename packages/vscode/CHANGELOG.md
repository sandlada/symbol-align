# Changelog

All notable changes of the Symbol Align extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Format Selection.** The extension registers a range formatter, so *Format
  Selection* of the editor aligns the selected lines. The whole document is
  scanned, so a string or a comment that reaches into the selection stays
  untouched.
- **Unsaved documents.** The formatter also serves documents that were never
  saved (`untitled` scheme).
- **The configuration file of the repository.** The extension reads the nearest
  `symbol-align.config.json` of the workspace folder of the document, including
  its per file `overrides`. A setting that the user set explicitly wins over the
  file, every other setting falls back to it.

### Changed

- **A failure is reported instead of thrown.** A failure of the core is shown
  as a notification; the provider never throws into the extension host.
- **`symbolAlign.maxDeclarationPad` accepts `0`.** Zero means "unlimited", the
  same behaviour that the API of the core library has.

### Fixed

- **The line endings of a windows document survive an alignment.** The replaced
  range of a selection now covers the carriage return of the line, so a file
  with CRLF endings does not get a second carriage return.

## [0.0.1] - 2026-10-25

### Added

- The first release: a document formatter, the commands *Align Document* and
  *Align Selection*, and the settings of the core library.
