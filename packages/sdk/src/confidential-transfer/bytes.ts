export function mutableBytes(bytes: ArrayLike<number>): Uint8Array {
    return new Uint8Array(Array.from(bytes));
}
