declare type NonOptionalType<T> = {
    [key in keyof T]-?: T[key];
};
declare type RecordType = {
    _meta?: {
        query: any;
    };
};
declare type Unpacked<T> = T extends {
    [K in keyof T]: infer U;
} ? U : never;
declare type DataTypeExtractField<BaseType, Key extends keyof BaseType> = NonOptionalType<BaseType>[Key] & {} extends RecordType ? (null extends BaseType[Key] ? {} | null : {}) : NonOptionalType<BaseType>[Key] extends RecordType[] ? {}[] : NonOptionalType<BaseType>[Key];
declare type DataTypeExtractFieldsFromQuery<BaseType, Fields> = {
    [key in Fields & keyof (BaseType)]: DataTypeExtractField<BaseType, key>;
};
declare type DataTypeExtractFromQueryHash<BaseType, QueryType> = {
    [key in (keyof BaseType) & (keyof QueryType)]: (QueryType[key] extends true ? DataTypeExtractField<BaseType, key> : (NonOptionalType<BaseType>[key]) extends any[] ? DataTypeFromQuery<NonOptionalType<BaseType>[key][0], QueryType[key]>[] : null extends BaseType[key] ? DataTypeFromQuery<BaseType[key] & {}, QueryType[key]> | null : DataTypeFromQuery<BaseType[key] & {}, QueryType[key]>);
};
declare type DataTypeFromQuery<BaseType, QueryType> = QueryType extends keyof BaseType ? DataTypeExtractFieldsFromQuery<NonOptionalType<BaseType>, QueryType> : QueryType extends Readonly<(keyof BaseType)[]> ? DataTypeExtractFieldsFromQuery<NonOptionalType<BaseType>, Unpacked<QueryType>> : QueryType extends {
    as: string;
} ? {
    error: 'type for alias field is not supported';
} | undefined : QueryType extends {
    attributes: any;
} ? DataTypeExtractFromQueryHash<BaseType, QueryType['attributes']> : DataTypeExtractFromQueryHash<BaseType, QueryType>;
declare type QueryTypeFromBaseType<BaseType> = BaseType extends {
    _meta?: {
        query: infer QueryBaseType;
    };
} ? QueryBaseType | (keyof QueryBaseType) | ((keyof QueryBaseType)[]) : never;
declare type SelectNonOptionalQueryHash<T> = T extends string | true | string[] ? never : T extends {
    params: any;
} ? never : NonOptionalType<T & object>;
declare type _ValidateNoExtraField<QueryType, Type> = Type extends boolean ? true : Type extends string ? (Type extends QueryType ? true : false) : Type extends Readonly<string[]> ? (Unpacked<Type> extends QueryType ? true : false) : keyof (Type) extends (keyof SelectNonOptionalQueryHash<QueryType & object>) ? (false extends Unpacked<{
    [key in (keyof SelectNonOptionalQueryHash<QueryType & object>) & (keyof Type)]: (ValidateNoExtraField<SelectNonOptionalQueryHash<QueryType & object>[key], Type[key]>);
}> ? false : true) : false;
declare type ValidateNoExtraField<QueryType, Type> = Type extends {
    attributes: string | string[] | {};
} ? _ValidateNoExtraField<QueryType, Type['attributes']> : _ValidateNoExtraField<QueryType, Type>;
declare type DeepReadonly<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
};
declare type DataType<BaseType extends RecordType, QueryType extends DeepReadonly<QueryTypeFromBaseType<BaseType>>> = true extends ValidateNoExtraField<QueryTypeFromBaseType<BaseType>, QueryType> ? DataTypeFromQuery<BaseType, QueryType> : never;
export default DataType;
