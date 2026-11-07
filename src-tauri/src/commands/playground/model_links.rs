//! Where a curated Playground model comes from, and where its model card and usage docs are. The
//! model detail page links to these. They are fixed per recipe: the webview never supplies a link.

use serde::Serialize;

/// The links of one curated model. Every URL is https.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelLinks {
    /// The Hugging Face repo (`owner/name`) whose README.md is the model card, or None when the
    /// model has no card to show.
    pub card_repo: Option<&'static str>,
    /// The page the weights come from: the Hugging Face repo or the GitHub release.
    pub source_url: &'static str,
    /// The page that explains how the model or its engine is used, or None.
    pub docs_url: Option<&'static str>,
}

/// Fails the test when `links` is not well formed: an https source, a card that is `owner/name`
/// and an https docs page when there is one.
#[cfg(test)]
pub(super) fn assert_well_formed(id: &str, links: &ModelLinks) {
    assert!(
        links.source_url.starts_with("https://"),
        "{id}: source_url {} is not https",
        links.source_url
    );
    if let Some(repo) = links.card_repo {
        let parts: Vec<&str> = repo.split('/').collect();
        assert!(
            parts.len() == 2
                && parts
                    .iter()
                    .all(|part| !part.is_empty() && !part.contains(' ')),
            "{id}: card_repo {repo} is not owner/name"
        );
    }
    if let Some(url) = links.docs_url {
        assert!(
            url.starts_with("https://"),
            "{id}: docs_url {url} is not https"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_serialise_with_camel_case_names() {
        let links = ModelLinks {
            card_repo: Some("owner/name"),
            source_url: "https://huggingface.co/owner/name",
            docs_url: None,
        };
        let json = serde_json::to_value(links).expect("json");
        assert_eq!(json["cardRepo"], "owner/name");
        assert_eq!(json["sourceUrl"], "https://huggingface.co/owner/name");
        assert!(json["docsUrl"].is_null());
    }
}
