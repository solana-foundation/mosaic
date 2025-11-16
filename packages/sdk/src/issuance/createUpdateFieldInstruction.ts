// adapted from https://github.com/solana-program/token-metadata/blob/30c5c5559667d0ef73c7ff49aa517e3578f539f7/clients/js-legacy/src/instruction.ts

import {
    AccountRole,
    addEncoderSizePrefix,
    getBytesEncoder,
    getStructCodec,
    getTupleEncoder,
    getU32Encoder,
    getUnitCodec,
    getUtf8Encoder,
    transformEncoder,
    type AccountMeta,
    type Address,
    type Encoder,
    type Instruction,
    type VariableSizeEncoder,
    addCodecSizePrefix,
    getUtf8Codec,
    getU32Codec,
    getTupleCodec,
    getStructEncoder,
    getDiscriminatedUnionEncoder,
} from 'gill';

function getInstructionEncoder<T extends object>(discriminator: Uint8Array, dataEncoder: Encoder<T>): Encoder<T> {
    return transformEncoder(getTupleEncoder([getBytesEncoder(), dataEncoder]), (data: T): [Uint8Array, T] => [
        discriminator,
        data,
    ]);
}

function getStringEncoder(): VariableSizeEncoder<string> {
    return addEncoderSizePrefix(getUtf8Encoder(), getU32Encoder());
}

enum Field {
    Name,
    Symbol,
    Uri,
}
type FieldLayout = { __kind: 'Name' } | { __kind: 'Symbol' } | { __kind: 'Uri' } | { __kind: 'Key'; value: [string] };

const getFieldCodec = () =>
    [
        ['Name', getUnitCodec()],
        ['Symbol', getUnitCodec()],
        ['Uri', getUnitCodec()],
        ['Key', getStructCodec([['value', getTupleCodec([addCodecSizePrefix(getUtf8Codec(), getU32Codec())])]])],
    ] as const;

function getFieldConfig(field: Field | string): FieldLayout {
    if (field === Field.Name || field === 'Name' || field === 'name') {
        return { __kind: 'Name' };
    } else if (field === Field.Symbol || field === 'Symbol' || field === 'symbol') {
        return { __kind: 'Symbol' };
    } else if (field === Field.Uri || field === 'Uri' || field === 'uri') {
        return { __kind: 'Uri' };
    } else {
        return { __kind: 'Key', value: [field] };
    }
}

interface UpdateFieldInstruction {
    programAddress: Address;
    metadata: Address;
    updateAuthority: Address;
    field: string;
    value: string;
}

export function createUpdateFieldInstruction(args: UpdateFieldInstruction): Instruction {
    const { programAddress, metadata, updateAuthority, field, value } = args;

    const accounts: AccountMeta[] = [
        { address: metadata, role: AccountRole.WRITABLE },
        { address: updateAuthority, role: AccountRole.READONLY_SIGNER },
    ];
    const data = Buffer.from(
        getInstructionEncoder(
            new Uint8Array([
                /* await splDiscriminate('spl_token_metadata_interface:updating_field') */
                221, 233, 49, 45, 181, 202, 220, 200,
            ]),
            getStructEncoder([
                ['field', getDiscriminatedUnionEncoder(getFieldCodec())],
                ['value', getStringEncoder()],
            ]),
        ).encode({ field: getFieldConfig(field), value }),
    );

    return {
        programAddress,
        accounts,
        data,
    };
}
