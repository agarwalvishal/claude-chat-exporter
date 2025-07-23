function extractConversation() {
  let markdown = "# Conversation with Claude\n\n";
  const messages = document.querySelectorAll('.font-claude-message, .font-user-message');
  
  messages.forEach((message) => {
    const isHuman = message.classList.contains('font-user-message');
    const role = isHuman ? 'Human' : 'Claude';
    markdown += `## ${role}:\n\n`;
    
    if (isHuman) {
      // For human messages, process the entire message
      const result = { markdown: '' };
      processContent(message, result);
      markdown += result.markdown;
    } else {
      // For Claude messages, extract only the non-thinking content
      const responseContent = extractClaudeResponse(message);
      if (responseContent) {
        markdown += responseContent;
      }
    }
    
    markdown += "\n";
  });
  
  return markdown;
}

function extractClaudeResponse(claudeMessage) {
  let responseMarkdown = '';
  
  // Get all direct children of the Claude message
  const children = Array.from(claudeMessage.children);
  
  children.forEach(child => {
    // Skip thinking blocks - they have transition-all class
    if (isThinkingBlock(child)) {
      return; // Skip thinking blocks
    }
    
    // Skip artifact containers (they're handled separately if needed)
    if (isArtifactBlock(child)) {
      return; // Skip artifacts for now - could be added later if needed
    }
    
    // Process content blocks - look for .grid-cols-1 within non-thinking containers
    const contentGrid = child.querySelector('.grid-cols-1');
    if (contentGrid) {
      const result = { markdown: '' };
      processContent(contentGrid, result);
      responseMarkdown += result.markdown;
    }
  });
  
  return responseMarkdown;
}

function isThinkingBlock(element) {
  // transition-all is unique to thinking blocks
  return element.className.includes('transition-all');
}

function isArtifactBlock(element) {
  // Artifact blocks have pt-3 pb-3 classes and contain artifact-related content
  const classes = element.className;
  return classes.includes('pt-3') && classes.includes('pb-3') ||
         element.querySelector('.artifact-block-cell') !== null;
}

function processContent(element, result = { markdown: '' }, depth = 0) {
  const children = element.childNodes;
  
  for (let child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      result.markdown += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      switch (child.tagName) {
        case 'P':
          result.markdown += processInlineElements(child) + "\n\n";
          break;
        case 'OL':
          result.markdown += processList(child, 'ol', depth) + "\n";
          break;
        case 'UL':
          result.markdown += processList(child, 'ul', depth) + "\n";
          break;
        case 'PRE':
          const codeBlock = child.querySelector('code');
          if (codeBlock) {
            const content = codeBlock.textContent.trim();
            const language = codeBlock.className.match(/language-(\w+)/)?.[1] || '';
            
            // Remove the last line if it matches the language (redundant language word)
            if (language) {
              const lines = result.markdown.split('\n');
              // Check if the last non-empty line is just the language
              for (let i = lines.length - 1; i >= 0; i--) {
                if (lines[i].trim() !== '') {
                  if (lines[i].trim() === language) {
                    lines.splice(i, 1); // Remove the redundant language line
                  }
                  break;
                }
              }
              result.markdown = lines.join('\n');
            }
            
            result.markdown += "```" + language + "\n" + content + "\n```\n\n";
          }
          break;
        case 'BLOCKQUOTE':
          result.markdown += "> " + processInlineElements(child).replace(/\n/g, '\n> ') + "\n\n";
          break;
        case 'H1':
          result.markdown += "# " + processInlineElements(child) + "\n\n";
          break;
        case 'H2':
          result.markdown += "## " + processInlineElements(child) + "\n\n";
          break;
        case 'H3':
          result.markdown += "### " + processInlineElements(child) + "\n\n";
          break;
        case 'H4':
          result.markdown += "#### " + processInlineElements(child) + "\n\n";
          break;
        case 'H5':
          result.markdown += "##### " + processInlineElements(child) + "\n\n";
          break;
        case 'H6':
          result.markdown += "###### " + processInlineElements(child) + "\n\n";
          break;
        case 'DIV':
          // Recursively process div content - passing same result object
          processContent(child, result, depth);
          break;
        default:
          // For other elements, process inline content
          const inlineContent = processInlineElements(child);
          if (inlineContent.trim()) {
            result.markdown += inlineContent + "\n\n";
          }
      }
    }
  }
}

function processList(listElement, listType, depth = 0) {
  let markdown = '';
  const items = listElement.children;
  const indent = '  '.repeat(depth);
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = listType === 'ol' ? `${i + 1}. ` : '- ';
    markdown += indent + prefix + processInlineElements(item).trim() + "\n";
    
    // Handle nested lists
    const nestedLists = item.querySelectorAll(':scope > ol, :scope > ul');
    for (let nestedList of nestedLists) {
      markdown += processList(nestedList, nestedList.tagName.toLowerCase(), depth + 1);
    }
  }
  
  return markdown;
}

function processInlineElements(element) {
  let markdown = '';
  const children = element.childNodes;
  
  for (let child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      markdown += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      switch (child.tagName) {
        case 'CODE':
          markdown += '`' + child.textContent + '`';
          break;
        case 'STRONG':
        case 'B':
          markdown += '**' + processInlineElements(child) + '**';
          break;
        case 'EM':
        case 'I':
          markdown += '*' + processInlineElements(child) + '*';
          break;
        case 'A':
          const href = child.getAttribute('href');
          const linkText = processInlineElements(child);
          markdown += href ? `[${linkText}](${href})` : linkText;
          break;
        case 'OL':
        case 'UL':
          // Skip nested lists here, they will be handled separately
          continue;
        default:
          markdown += processInlineElements(child);
      }
    }
  }
  
  return markdown;
}

function downloadMarkdown(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Run the exporter
const conversationMarkdown = extractConversation();
downloadMarkdown(conversationMarkdown, 'claude_conversation.md');
