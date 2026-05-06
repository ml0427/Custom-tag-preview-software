use regex::Regex;

fn apply_rules_to_name(name: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    let re = Regex::new(r"^\s*[\[【](.*?)[\]】]").unwrap();
    if let Some(caps) = re.captures(name) {
        let content = &caps[1];
        let segments: Vec<&str> = content
            .split(|c| c == '(' || c == ')' || c == ',' || c == '（' || c == '）' || c == '、')
            .collect();

        for segment in segments {
            let clean_name = segment.trim();
            if !clean_name.is_empty() {
                tags.push(clean_name.to_string());
            }
        }
    }
    tags
}

fn main() {
    let name = "[INSERT (KEN)] 僕だけの爆乳オナメイド -貸出編- (オリジナル)(C77)";
    let tags = apply_rules_to_name(name);
    println!("Name: {}", name);
    println!("Extracted Tags: {:?}", tags);
    
    assert!(tags.contains(&"INSERT".to_string()));
    assert!(tags.contains(&"KEN".to_string()));
    println!("Verification SUCCESS!");
}
