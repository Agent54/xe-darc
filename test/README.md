# Micromark Stream Tests

This directory contains test files demonstrating the micromark streaming functionality used in the Agent.svelte component.

## Files

- `micromark-stream-example.js` - Basic example from the micromark readme
- `micromark-stream-advanced.js` - Advanced examples with multiple streaming patterns
- `example.md` - Sample markdown file for testing
- `output.html` - Generated HTML output (created when running tests)

## Running the Tests

### Basic Example

```bash
node test/micromark-stream-example.js
```

This runs the simple example that streams a markdown file to stdout.

### Advanced Examples

```bash
node test/micromark-stream-advanced.js
```

This runs multiple tests demonstrating:
1. Basic streaming to stdout
2. Streaming with data collection
3. Streaming to file output
4. Simulating chunk-by-chunk streaming (like in Agent.svelte)

## What These Tests Demonstrate

The tests show how micromark's streaming functionality works:

- **Real-time processing**: Markdown is converted to HTML as it streams
- **Memory efficiency**: Large files can be processed without loading everything into memory
- **Incremental updates**: Perfect for live chat/agent interfaces
- **Error handling**: Proper error management in streaming scenarios

## Integration with Agent.svelte

The Agent.svelte component uses similar streaming patterns to:
- Display markdown content as it arrives from the AI
- Provide smooth, real-time updates to the user
- Handle large responses efficiently
- Maintain responsive UI during content generation

## Requirements

- Node.js 23.0.0 or higher
- micromark package (already included in package.json)

## Example Output

The tests will show HTML output being generated in real-time from the markdown input, demonstrating the streaming capability that makes the Agent interface feel responsive and modern. 