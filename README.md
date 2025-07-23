# Claude Chat Exporter

Claude Chat Exporter is a JavaScript tool that allows you to export your conversations with Claude AI into a well-formatted Markdown file. This script intelligently captures human and AI messages while filtering out thinking blocks and technical artifacts, preserving only the actual conversation content with proper structure and formatting.

## Features

- **Smart Content Filtering**: Automatically excludes Claude's thinking blocks and artifacts, exporting only the actual conversation
- **Conversation Structure Preservation**: Maintains Human/Claude alternation with proper markdown headers
- **Rich Content Support**: Handles nested lists, code blocks, inline formatting, headers, blockquotes, and links
- **Clean Code Block Formatting**: Properly formats code blocks with language specification
- **Robust DOM Parsing**: Works with Claude's current interface structure including collapsible thinking sections
- **One-Click Export**: Generates a downloadable Markdown file with a single script execution

## Usage

1. Open your conversation with Claude in your web browser.
2. Open the browser's developer console:
   - Chrome/Edge: Press F12 or Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac)
   - Firefox: Press F12 or Ctrl+Shift+K (Windows/Linux) or Cmd+Option+K (Mac)
   - Safari: Enable the Develop menu in preferences, then press Cmd+Option+C
3. Copy the entire script in the file `claude-chat-exporter.js` and paste it into the console.
4. Press Enter to run the script.
5. The script will automatically generate and download a file named `claude_conversation.md`.

## How it Works

The script performs the following steps:

1. **Message Identification**: Locates all conversation messages using CSS selectors
2. **Content Filtering**: Distinguishes between actual responses and thinking blocks/artifacts
3. **Smart Processing**: Extracts content while maintaining proper formatting
4. **Markdown Conversion**: Transforms HTML structure into clean Markdown syntax
5. **File Generation**: Creates and downloads a formatted Markdown file

## Key Functions

### Core Functions
- `extractConversation()`: Main orchestrator that controls the overall export process
- `extractClaudeResponse()`: Filters Claude messages to extract only actual response content
- `processContent()`: Processes individual message content with shared accumulator for proper formatting

### Content Processing
- `processList()`: Handles nested lists (ordered and unordered) with proper indentation
- `processInlineElements()`: Manages inline formatting (code, bold, italic, links)

### Smart Filtering
- `isThinkingBlock()`: Identifies and excludes Claude's thinking blocks using `transition-all` class detection
- `isArtifactBlock()`: Detects and optionally excludes artifact containers

### Utility Functions
- `downloadMarkdown()`: Generates and triggers download of the exported file

## Advanced Features

- **Thinking Block Detection**: Uses unique CSS class identifiers to reliably skip thinking content
- **Nested Content Handling**: Properly processes deeply nested DOM structures with shared state
- **Format Preservation**: Maintains original formatting including headers, blockquotes, and complex list structures

## Customization

You can modify the script to change the output format or add additional features:

- **Content Selection**: Modify `isThinkingBlock()` or `isArtifactBlock()` to change what content gets filtered
- **Output Format**: Customize `processContent()` to change markdown formatting rules
- **File Naming**: Update the `downloadMarkdown()` call to change the output filename
- **Additional Elements**: Extend the switch statement in `processContent()` to handle new HTML elements

## Limitations

- Designed for the current Claude AI interface (as of 2025)
- Interface changes may require updates to CSS selectors or DOM structure handling
- Complex interactive elements or custom widgets may not be fully captured
- Artifact content is currently skipped (can be enabled by modifying `isArtifactBlock()`)

## Contributing

Contributions to improve the script or add new features are welcome! Please feel free to submit a pull request or open an issue to discuss potential changes.

Areas for potential enhancement:
- Support for artifact content inclusion
- Batch processing of multiple conversations

## License

This project is open source and available under the [MIT License](LICENSE).

## Disclaimer

This script is not officially associated with Anthropic or Claude AI. It is a community-created tool to enhance the user experience. Use it responsibly and in accordance with Anthropic's terms of service.
