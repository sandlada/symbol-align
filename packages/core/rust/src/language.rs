//! Language profiles of the core.
//!
//! The data is generated from `languages.json` into [`crate::language_data`].
//! Profiles are converted to owned values on demand so that the scanner can
//! work with built-in profiles and custom profiles through one code path.

use crate::language_data::{self, LanguageProfileData};
use crate::types::{DeclarationStyle, EscapeMode, LanguageProfile, StringDelimiter};

/// Converts one generated delimiter into the owned type.
fn delimiter(source: &language_data::StringDelimiterData) -> StringDelimiter {
    let escape = match source.escape {
        "doubled" => EscapeMode::Doubled,
        "none" => EscapeMode::None,
        _ => EscapeMode::Backslash,
    };

    StringDelimiter {
        open: source.open.to_owned(),
        close: source.close.to_owned(),
        escape,
        multiline: source.multiline,
    }
}

/// Converts one generated profile into the owned type.
fn profile_from_data(source: &LanguageProfileData) -> LanguageProfile {
    let declarations = match source.declarations {
        "prefix" => DeclarationStyle::Prefix,
        "type-first" => DeclarationStyle::TypeFirst,
        _ => DeclarationStyle::None,
    };

    LanguageProfile {
        id: source.id.to_owned(),
        name: source.name.to_owned(),
        extensions: source
            .extensions
            .iter()
            .map(|extension| (*extension).to_owned())
            .collect(),
        line_comments: source
            .line_comments
            .iter()
            .map(|marker| (*marker).to_owned())
            .collect(),
        block_comments: source
            .block_comments
            .iter()
            .map(|block| (block.open.to_owned(), block.close.to_owned()))
            .collect(),
        strings: source.strings.iter().map(delimiter).collect(),
        operators: source
            .operators
            .iter()
            .map(|operator| (*operator).to_owned())
            .collect(),
        default_symbols: source
            .default_symbols
            .iter()
            .map(|symbol| (*symbol).to_owned())
            .collect(),
        declarations,
    }
}

/// The number of generated language profiles.
pub fn profile_count() -> usize {
    language_data::PROFILES.len()
}

/// Every language profile, in the order of the public `LanguageId` union.
pub fn all_profiles() -> Vec<LanguageProfile> {
    language_data::PROFILES
        .iter()
        .map(profile_from_data)
        .collect()
}

/// Looks up one generated profile.
fn data(id: &str) -> Option<&'static LanguageProfileData> {
    language_data::PROFILES
        .iter()
        .find(|profile| profile.id == id)
}

/// Returns the profile of `id`, falling back to `generic` like the TypeScript API.
pub fn profile(id: &str) -> LanguageProfile {
    data(id).map(profile_from_data).unwrap_or_else(generic)
}

/// The `generic` profile.
pub fn generic() -> LanguageProfile {
    data("generic")
        .map(profile_from_data)
        .unwrap_or_else(|| LanguageProfile {
            id: "generic".to_owned(),
            name: "Generic".to_owned(),
            extensions: Vec::new(),
            line_comments: vec!["//".to_owned()],
            block_comments: vec![("/*".to_owned(), "*/".to_owned())],
            strings: Vec::new(),
            operators: vec!["=".to_owned()],
            default_symbols: vec!["=".to_owned()],
            declarations: DeclarationStyle::None,
        })
}

/// Whether `value` is a known language id.
pub fn is_language_id(value: &str) -> bool {
    data(value).is_some()
}

/// The default symbols of `id`, or the generic defaults for an unknown id.
pub fn default_symbols(id: &str) -> Vec<String> {
    profile(id).default_symbols
}

/// The last path segment of a POSIX or Windows style path.
fn file_name_of(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or("")
}

/// Detects the language of a file path by its extension.
pub fn detect_language(path: &str) -> String {
    let file_name = file_name_of(path);

    let Some(dot) = file_name.rfind('.') else {
        return "generic".to_owned();
    };

    if dot == 0 {
        return "generic".to_owned();
    }

    let extension = file_name[dot + 1..].to_lowercase();

    language_data::PROFILES
        .iter()
        .find(|profile| {
            profile
                .extensions
                .iter()
                .any(|candidate| *candidate == extension)
        })
        .map_or_else(|| "generic".to_owned(), |profile| profile.id.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_declared_language_has_a_profile() {
        assert_eq!(profile_count(), 57);
    }

    #[test]
    fn unknown_ids_fall_back_to_generic() {
        assert_eq!(profile("does-not-exist").id, "generic");
    }

    #[test]
    fn detects_the_language_from_the_extension() {
        assert_eq!(detect_language("src/main.rs"), "rust");
        assert_eq!(detect_language("C:\\src\\Main.Cs"), "csharp");
        assert_eq!(detect_language("Makefile"), "generic");
    }

    #[test]
    fn generic_profile_has_usable_defaults() {
        let profile = generic();

        assert_eq!(profile.default_symbols, vec!["=".to_owned()]);
    }
}
