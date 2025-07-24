# Micromark Stream Test

This is a **test markdown file** to demonstrate the micromark streaming functionality with all the new extensions.

## Features

- Stream processing of markdown
- Real-time HTML output
- Error handling
- *Efficient* parsing
- GitHub Flavored Markdown support

### Code Example

```javascript
import {stream} from 'micromark/stream'

// Stream markdown to HTML
stream().pipe(process.stdout)
```

## GFM Extensions Test

### Strikethrough
~~This text is struck through~~

### Tables
| Feature | Status | Notes |
|---------|--------|-------|
| Streaming | ✅ | Works great |
| Performance | ✅ | Very fast |  
| Error handling | ✅ | Robust |

### Task Lists
- [x] Add extensions to package.json
- [x] Update test files
- [x] Configure Agent.svelte
- [ ] Test all features

### Footnotes
Here's a sentence with a footnote[^1].

[^1]: This is the footnote content.

### Autolinks
Visit www.example.com or https://github.com/micromark/micromark

### Frontmatter
---
title: Test Document
date: 2025-01-10
---

## Directives Test

:warning[This is a warning directive]{.important}

## List Example

1. First item
2. Second item
3. Third item

### Blockquote

> This is a blockquote demonstrating
> how micromark handles streaming content
> with proper line breaks.

---

**End of test document** 