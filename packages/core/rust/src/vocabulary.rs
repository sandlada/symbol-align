//! Cross-language keyword vocabularies for declaration alignment.
//!
//! The sets are deliberately supersets: a word only has to look like a
//! modifier, a statement keyword, a declaration keyword or a builtin type in
//! one supported language for the locator to treat it as one.

/// Words that may introduce a declaration.
pub static MODIFIERS: &[&str] = &[
    "abstract",
    "async",
    "const",
    "constexpr",
    "contravariant",
    "covariant",
    "declare",
    "default",
    "explicit",
    "export",
    "extern",
    "file",
    "final",
    "friend",
    "implicit",
    "inline",
    "internal",
    "late",
    "let",
    "mutable",
    "native",
    "new",
    "override",
    "partial",
    "private",
    "protected",
    "public",
    "readonly",
    "register",
    "required",
    "sealed",
    "static",
    "strictfp",
    "synchronized",
    "thread_local",
    "transient",
    "unsafe",
    "val",
    "virtual",
    "volatile",
];

/// Words that start a statement, never a declaration.
pub static STATEMENT_KEYWORDS: &[&str] = &[
    "assert",
    "await",
    "break",
    "case",
    "catch",
    "checked",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "finally",
    "fixed",
    "for",
    "foreach",
    "goto",
    "if",
    "import",
    "lock",
    "nameof",
    "namespace",
    "new",
    "package",
    "raise",
    "return",
    "sizeof",
    "switch",
    "throw",
    "try",
    "typeof",
    "unchecked",
    "unsafe",
    "using",
    "while",
    "yield",
];

/// Words that declare a type rather than a value.
pub static DECLARATION_KEYWORDS: &[&str] = &[
    "class",
    "def",
    "enum",
    "extension",
    "fn",
    "func",
    "impl",
    "interface",
    "module",
    "namespace",
    "object",
    "protocol",
    "record",
    "struct",
    "sub",
    "trait",
    "type",
    "union",
];

/// Words that can never be the name of a declaration.
pub static NON_NAMES: &[&str] = &["base", "cls", "operator", "self", "super", "this"];

/// Words that name a builtin type in at least one supported language.
pub static BUILTIN_TYPES: &[&str] = &[
    "auto", "bool", "byte", "char", "decimal", "double", "dynamic", "float", "int", "long",
    "object", "sbyte", "short", "signed", "size_t", "string", "uint", "ulong", "unsigned",
    "ushort", "var", "void", "wchar_t",
];

/// Whether `word` is a declaration modifier.
pub fn is_modifier(word: &str) -> bool {
    MODIFIERS.contains(&word)
}

/// Whether `word` starts a statement.
pub fn is_statement_keyword(word: &str) -> bool {
    STATEMENT_KEYWORDS.contains(&word)
}

/// Whether `word` declares a type.
pub fn is_declaration_keyword(word: &str) -> bool {
    DECLARATION_KEYWORDS.contains(&word)
}

/// Whether `word` can never name a declaration.
pub fn is_non_name(word: &str) -> bool {
    NON_NAMES.contains(&word)
}

/// Whether `word` is a builtin type.
pub fn is_builtin_type(word: &str) -> bool {
    BUILTIN_TYPES.contains(&word)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vocabularies_are_sorted_and_unique() {
        for set in [
            MODIFIERS,
            STATEMENT_KEYWORDS,
            DECLARATION_KEYWORDS,
            NON_NAMES,
            BUILTIN_TYPES,
        ] {
            let mut sorted = set.to_vec();
            sorted.sort_unstable();
            sorted.dedup();

            assert_eq!(sorted, set);
        }
    }
}
