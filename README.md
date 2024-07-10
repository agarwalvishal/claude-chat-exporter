# Claude Chat Exporter

Claude Chat Exporter is a JavaScript tool that allows you to export your conversations with Claude AI into a well-formatted Markdown file. This script captures both human and AI messages, preserving the structure of the conversation including nested lists, code blocks, and inline formatting.

## Features

- Exports conversations from Claude AI interface to Markdown format
- Preserves conversation structure (Human/Claude alternation)
- Handles nested lists (both ordered and unordered)
- Formats code blocks with language specification
- Maintains inline code formatting
- Generates a downloadable Markdown file

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

1. Identifies and extracts all messages in the conversation.
2. Processes each message, differentiating between Human and Claude responses.
3. Handles various elements within each message, including paragraphs, lists, and code blocks.
4. Formats the content into Markdown syntax.
5. Generates a downloadable Markdown file containing the formatted conversation.

## Customization

You can modify the script to change the output format or add additional features. Key functions that you might want to customize include:

- `extractConversation()`: Controls the overall structure of the exported document.
- `processContent()`: Handles the processing of individual message content.
- `processList()`: Manages the formatting of lists, including nested lists.
- `processInlineElements()`: Deals with inline formatting like code snippets.

## Limitations

- The script is designed to work with the current Claude AI interface. Changes to the interface may require updates to the script.
- It may not capture all types of interactive elements or complex structures that could be present in Claude's responses.

## Contributing

Contributions to improve the script or add new features are welcome! Please feel free to submit a pull request or open an issue to discuss potential changes.

## License

This project is open source and available under the [MIT License](LICENSE).

## Disclaimer

This script is not officially associated with Anthropic or Claude AI. It is a community-created tool to enhance the user experience. Use it responsibly and in accordance with Anthropic's terms of service.
