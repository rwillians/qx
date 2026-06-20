const ALIAS = Symbol.for('ALIAS');
const NAME = Symbol.for('NAME');

type Codec<
  Encoded = any,
  Decoded = any,
> = {
  primitive: string;
  encode: (value: Decoded) => Encoded;
  decode: (value: Encoded) => Decoded;
};

type Column<
  Name extends string = string,
  T extends Codec = Codec,
> = T & {
  [NAME]: Name;
};

type Table<
  Name extends string = string,
  Shape extends Record<string, Column> = Record<string, Column>,
> = Shape & {
  [NAME]: Name;
};

type Aliased<
  A extends string = string,
  T extends object = object,
> = T & {
  [ALIAS]: A;
};

type Aliasable<
  T extends object = object,
> = T & {
  as: <A extends string>(name: A) => Aliased<A, T>;
};

const self = <T>(value: T) => value;

export const t = {
  string: (): Codec<string, string> => ({
    primitive: 'STRING',
    encode: self<string>,
    decode: self<string>,
  }),
  uuid: (): Codec<string, string> => ({
    primitive: 'UUID',
    encode: self<string>,
    decode: self<string>,
  }),
};

export const table = <
  U extends string,
  T extends Record<string, Codec>,
>(name: U, shape: T) => {
  const columns = Object.fromEntries(
    Object
      .entries(shape)
      .map(([key, codec]) => [key, { ...codec, [NAME]: key }] as const)
  );

  const base = {
    ...columns,
    [NAME]: name,
  } as Table<U, { [K in keyof T]: Column<K & string, T[K]> }>;

  const $as = <A extends string>(alias: A) => {
    const cols = Object.fromEntries(
      Object
        .entries(columns)
        .map(([key, column]) => [key, { ...column, [ALIAS]: `${alias}."${column[NAME]}"`}] as const)
    );

    return { ...cols, [NAME]: name, [ALIAS]: alias } as Aliased<A, typeof base>;
  };

  return { ...base, as: $as } as Aliasable<typeof base>;
};
