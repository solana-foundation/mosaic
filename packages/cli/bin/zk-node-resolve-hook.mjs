// Node module-resolution hook for the @solana/zk-sdk wasm problem.
//
// @solana-program/token-2022's root entry statically imports
// `@solana/zk-sdk/bundler`, an ESM build that imports its `.wasm` file with a
// bare import statement — something bundlers understand but Node does not
// (ERR_UNKNOWN_FILE_EXTENSION ".wasm"). The package exposes no way to import
// around it, so every consumer of token-2022 is unloadable in plain Node.
//
// Redirect that one specifier to `@solana/zk-sdk/node`, the CJS build that
// reads the wasm from disk itself. Resolution is anchored to this file's
// location (the CLI package), where @solana/zk-sdk is a direct dependency —
// so it works regardless of how npm lays out the installed tree.
export async function resolve(specifier, context, next) {
    if (specifier === '@solana/zk-sdk/bundler') {
        const resolved = await next('@solana/zk-sdk/node', {
            ...context,
            parentURL: import.meta.url,
        });
        return { ...resolved, shortCircuit: true };
    }
    return next(specifier, context);
}
