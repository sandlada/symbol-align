import type { LanguageId } from '@sandlada/symbol-align';
import jsonSerializerOptions from '../samples/json-serializer-options.cs?raw';

/** Joins the lines of a snippet without adding indentation to the source. */
const lines = (...snippet: readonly string[]): string => snippet.join('\n');

/** Removes the trailing newline of a vendored source file. */
const vendored = (source: string): string => source.trimEnd();

/**
 * Real-world sources are split into their own chunks so the initial playground
 * bundle only carries the default C# file. Vite inlines each file as a string.
 */
const realWorldLoaders: Partial<Record<LanguageId, () => Promise<string>>> = {
    javascript: () => import('../samples/javascript-express-application.js?raw').then((module) => module.default),
    typescript: () => import('../samples/typescript-vscode-arrays.ts?raw').then((module) => module.default),
    python: () => import('../samples/python-requests-sessions.py?raw').then((module) => module.default),
    go: () => import('../samples/go-gin-context.go?raw').then((module) => module.default),
    rust: () => import('../samples/rust-axum-routing.rs?raw').then((module) => module.default),
    java: () => import('../samples/java-guava-immutablelist.java?raw').then((module) => module.default),
    kotlin: () => import('../samples/kotlin-okhttp-client.kt?raw').then((module) => module.default),
    swift: () => import('../samples/swift-vapor-application.swift?raw').then((module) => module.default),
    cpp: () => import('../samples/cpp-fmt-ranges.h?raw').then((module) => module.default),
};

/**
 * One realistic starter snippet per language profile.
 *
 * The popular programming languages use real, long source files from their
 * ecosystems; the remaining entries are short starters that show the profile's
 * syntax. The real files and their licenses live in `packages/playground/samples`.
 *
 * The map is exhaustive: when a new `LanguageId` is added to the core, this
 * object no longer satisfies its type and the playground stops compiling until
 * the profile gets a sample.
 */
export const samples = {
    generic: lines('// Generic profile — no language-specific strings or operators.', 'project = "symbol-align"', 'version = "0.1.0"', 'port = 5173'),

    javascript: lines("const project = 'symbol-align';", "const version = '0.1.0';", 'const port = 5173;', "const label = 'name = value stays untouched';"),

    typescript: lines('interface BuildOptions {', '    project: string;', '    outputDirectory: string;', '    minify: boolean;', '}', '', 'const project = "symbol-align";', 'const outputDirectory = "dist";', 'const minify = true;'),

    python: lines('project = "symbol-align"', 'version = "0.1.0"', 'port = 5173', 'message = "key = value stays inside this string"'),

    go: lines('package main', '', 'func main() {', '    project := "symbol-align"', '    version := "0.1.0"', '    port := 5173', '    timeout := 30', '}'),

    rust: lines('fn main() {', '    let project = "symbol-align";', '    let version = "0.1.0";', '    let port = 5173;', '    let message = "key = value is ignored";', '}'),

    java: lines('public final class Config {', '    private static final String PROJECT = "symbol-align";', '    private static final String VERSION = "0.1.0";', '    private static final int PORT = 5173;', '}'),

    kotlin: lines('object Config {', '    const val project = "symbol-align"', '    const val version = "0.1.0"', '    const val port = 5173', '}'),

    swift: lines('struct Config {', '    let project = "symbol-align"', '    let version = "0.1.0"', '    let port = 5173', '}'),

    csharp: vendored(jsonSerializerOptions),

    fsharp: lines(
        'type Config =',
        '    { Project: string',
        '      Version: string',
        '      Port: int }',
        '',
        'let project = "symbol-align"',
        'let version = "0.1.0"',
        'let defaultPort = 5173',
        '',
        'let describe config =',
        '    match config with',
        '    | { Port = port } when port > 0 -> sprintf "%s:%d" config.Project port',
        '    | _ -> "invalid config"',
    ),

    cpp: lines('#include <string>', '', 'int main() {', '    std::string project = "symbol-align";', '    std::string version = "0.1.0";', '    int port = 5173;', '    return 0;', '}'),

    c: lines('#include <stdio.h>', '', 'int main(void) {', '    const char* project = "symbol-align";', '    const char* version = "0.1.0";', '    int port = 5173;', '    return 0;', '}'),

    ruby: lines('project = "symbol-align"', 'version = "0.1.0"', 'port = 5173', 'options = { host: "localhost", port: 5173 }'),

    php: lines('<?php', '$project = "symbol-align";', '$version = "0.1.0";', '$port = 5173;', '$paths = ["root" => "/srv", "cache" => "/tmp"];'),

    dart: lines("final project = 'symbol-align';", "final version = '0.1.0';", 'final port = 5173;'),

    shell: lines('project="symbol-align"', 'version="0.1.0"', 'port=5173', 'export SYMBOL_ALIGN_HOME="/opt/symbol-align"'),

    sql: lines('SELECT', "    project = 'symbol-align',", "    version = '0.1.0',", '    port    = 5173', 'FROM settings', 'WHERE enabled = 1;'),

    yaml: lines('# This profile defaults to "=". Select ":" above to align the mappings.', 'project: symbol-align', 'version: 0.1.0', 'port: 5173'),

    json: lines('{', '  "project": "symbol-align",', '  "version": "0.1.0",', '  "port": 5173', '}'),

    css: lines(':root {', '  --project: "symbol-align";', '  --version: "0.1.0";', '  --port: 5173;', '}'),

    html: lines('<!doctype html>', '<html lang="en">', '  <head>', '    <meta charset="utf-8">', '    <meta name="description" content="Symbol Align playground">', '    <title>Symbol Align</title>', '  </head>', '</html>'),

    xml: lines('<?xml version="1.0" encoding="UTF-8"?>', '<config>', '    <project name="symbol-align" version="0.1.0" />', '    <server host="localhost" port="5173" />', '</config>'),

    markdown: lines('# Symbol Align', '', 'project = "symbol-align"', 'version = "0.1.0"', 'port = 5173'),

    plaintext: lines('project = "symbol-align"', 'version = "0.1.0"', 'port = 5173', 'note = "plain text has no strings to protect"'),

    elixir: lines('defmodule Config do', '  project = "symbol-align"', '  version = "0.1.0"', '  port = 5173', 'end'),

    haskell: lines('project = "symbol-align"', 'version = "0.1.0"', 'port = 5173'),

    lua: lines('local project = "symbol-align"', 'local version = "0.1.0"', 'local port = 5173', 'local config = { host = "localhost", port = 5173 }'),

    scala: lines('object Config {', '  val project = "symbol-align"', '  val version = "0.1.0"', '  val port = 5173', '}'),

    objectivec: lines('NSString *project = @"symbol-align";', 'NSString *version = @"0.1.0";', 'NSInteger port = 5173;'),

    perl: lines('my $project = "symbol-align";', 'my $version = "0.1.0";', 'my $port = 5173;'),

    julia: lines('project = "symbol-align"', 'version = "0.1.0"', 'port = 5173'),

    zig: lines('const project = "symbol-align";', 'const version = "0.1.0";', 'const port = 5173;'),

    powershell: lines('$project = "symbol-align"', '$version = "0.1.0"', '$port = 5173'),

    clojure: lines('(def project "symbol-align")', '(def version "0.1.0")', '(def port 5173)', '(= project "symbol-align")'),

    erlang: lines('-module(config).', '-export([start/0]).', '', 'start() ->', '    Project = "symbol-align",', '    Version = "0.1.0",', '    Port = 5173,', '    {Project, Version, Port}.'),

    r: lines('project <- "symbol-align"', 'version <- "0.1.0"', 'port <- 5173', 'label = "key = value stays untouched"'),

    fortran: lines('program config', '    implicit none', '    character(len=*), parameter :: project = "symbol-align"', '    character(len=*), parameter :: version = "0.1.0"', '    integer, parameter :: port = 5173', 'end program config'),

    nim: lines('let project = "symbol-align"', 'let version = "0.1.0"', 'let port = 5173'),

    crystal: lines('project = "symbol-align"', 'version = "0.1.0"', 'port = 5173'),

    gleam: lines('const project = "symbol-align"', 'const version = "0.1.0"', 'const port = 5173'),

    odin: lines('package main', '', 'main :: proc() {', '    project: string = "symbol-align"', '    version: string = "0.1.0"', '    port: int = 5173', '}'),

    solidity: lines('pragma solidity ^0.8.24;', 'contract Config {', '    string public project = "symbol-align";', '    string public version = "0.1.0";', '    uint256 public port = 5173;', '}'),

    groovy: lines('def project = "symbol-align"', 'def version = "0.1.0"', 'def port = 5173'),

    terraform: lines('locals {', '  project = "symbol-align"', '  version = "0.1.0"', '  port = 5173', '}'),

    toml: lines('project = "symbol-align"', 'version = "0.1.0"', 'port = 5173'),

    ini: lines('project = symbol-align', 'version = 0.1.0', 'port = 5173'),

    makefile: lines('PROJECT = symbol-align', 'VERSION = 0.1.0', 'PORT = 5173'),

    dockerfile: lines('FROM node:24-alpine', 'ENV PROJECT=symbol-align', 'ENV VERSION=0.1.0', 'ENV PORT=5173'),

    graphql: lines('type Config {', '  project: String', '  version: String', '  port: Int', '}'),

    vb: lines('Module Config', '    Const Project = "symbol-align"', '    Const Version = "0.1.0"', '    Const Port = 5173', 'End Module'),

    delphi: lines('const', "    Project = 'symbol-align';", "    Version = '0.1.0';", '    Port = 5173;'),

    vue: lines('<template>', '  <p>{{ project }}</p>', '</template>', '', '<script setup lang="ts">', 'const project = "symbol-align";', 'const version = "0.1.0";', 'const port = 5173;', '</script>'),

    svelte: lines('<script>', '  const project = "symbol-align";', '  const version = "0.1.0";', '  const port = 5173;', '</script>', '', '<p>{project} {version}</p>'),

    astro: lines('---', 'const project = "symbol-align";', 'const version = "0.1.0";', 'const port = 5173;', '---', '', '<p>{project} {version}</p>'),

    protobuf: lines('syntax = "proto3";', '', 'message Config {', '  string project = 1;', '  string version = 2;', '  int32 port = 3;', '}'),

    v: lines("const project = 'symbol-align'", "const version = '0.1.0'", 'const port = 5173'),
} as const satisfies Record<LanguageId, string>;

/**
 * Returns the sample of a language, falling back to the generic one.
 *
 * The popular programming languages load their real-world source on demand;
 * every other language resolves immediately from the starter map.
 */
export const sampleFor = async (language: LanguageId): Promise<string> => {
    const loader = realWorldLoaders[language];

    if (loader !== undefined) {
        return (await loader()).trimEnd();
    }

    return samples[language] ?? samples.generic;
};
