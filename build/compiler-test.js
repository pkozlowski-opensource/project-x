const ts = require("typescript");
const { spawn } = require('child_process');

const formatHost = {
    getCanonicalFileName: path => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine
};

function watchMain() {

    // TypeScript can use several different program creation "strategies":
    //  * ts.createEmitAndSemanticDiagnosticsBuilderProgram,
    //  * ts.createSemanticDiagnosticsBuilderProgram
    //  * ts.createAbstractBuilder
    // The first two produce "builder programs". These use an incremental strategy
    // to only re-check and emit files whose contents may have changed, or whose
    // dependencies may have changes which may impact change the result of prior
    // type-check and emit.
    // The last uses an ordinary program which does a full type check after every
    // change.
    // Between `createEmitAndSemanticDiagnosticsBuilderProgram` and
    // `createSemanticDiagnosticsBuilderProgram`, the only difference is emit.
    // For pure type-checking scenarios, or when another tool/process handles emit,
    // using `createSemanticDiagnosticsBuilderProgram` may be more desirable.
    const createProgram = ts.createSemanticDiagnosticsBuilderProgram;

    // Note that there is another overload for `createWatchCompilerHost` that takes
    // a set of root files.
    const host = ts.createWatchCompilerHost(
        ['src/markup_parser.ts', 'src/markup_parser.spec.ts'], //TODO(pk): this should be parametrised
        {
            sourceMap: true
        },
        ts.sys,
        createProgram,
        reportDiagnostic,
        reportWatchStatusChanged
    );

    // You can technically override any given hook on the host, though you probably
    // don't need to.
    // Note that we're assuming `origCreateProgram` and `origPostProgramCreate`
    // doesn't use `this` at all.
    const origCreateProgram = host.createProgram;
    host.createProgram = (
        rootNames,
        options,
        host,
        oldProgram
    ) => {
        // console.log("** We're about to create the program! **");
        return origCreateProgram(rootNames, options, host, oldProgram);
    };
    const origPostProgramCreate = host.afterProgramCreate;

    host.afterProgramCreate = program => {
        // console.log("** We finished making the program! **");
        origPostProgramCreate(program);
    };

    // `createWatchProgram` creates an initial program, watches files, and updates
    // the program over time.
    ts.createWatchProgram(host);
}

function reportDiagnostic(diagnostic) {
    console.error(ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost));
}

function isCompileDoneWithoutErrors(diagnostic) {
    return diagnostic.code === 6194 && diagnostic.messageText.startsWith('Found 0 errors');
}

/**
 * Prints a diagnostic every time the watch status changes.
 * This is mainly for messages like "Starting compilation" or "Compilation completed".
 */
function reportWatchStatusChanged(diagnostic) {
    // TODO(pk): gather time statistics so I get real-life numbers 

    console.info(ts.formatDiagnostic(diagnostic, formatHost));

    if (isCompileDoneWithoutErrors(diagnostic)) {
        // TODO(pk): kill in-progress Jasmine runs if any
        console.clear();

        // TODO(pk): I should have some kind of timeout in place in case a test goes into an infinite loop
        // add '--inspect-brk', to debug
        const jasmine = spawn('node', ['./node_modules/.bin/jasmine', '--reporter=jasmine-ts-console-reporter', 'src/markup_parser.spec.js'], { stdio: "inherit" });
    }
}

watchMain();