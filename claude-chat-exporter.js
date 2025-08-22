function extractConversation() {
  let markdown = "# Conversation with Claude\n\n";
  const messages = document.querySelectorAll('.font-claude-response, [data-testid="user-message"]');
  
  messages.forEach((message) => {
    const isHuman = message.hasAttribute('data-testid') && message.getAttribute('data-testid') === 'user-message';
    
    if (isHuman) {
      // For human messages, process the entire message
      // Look for the actual content grid within the user message
      const contentGrid = message.querySelector('.grid-cols-1') || message;
      const result = { markdown: '' };
      processContent(contentGrid, result);
      markdown += `## Human:\n\n${result.markdown}`;
    } else {
      // For Claude messages, extract only the non-thinking content
      const responseContent = extractClaudeResponse(message);
      if (responseContent) {
        markdown += `## Claude:\n\n${responseContent}`;
      }
    }
    
    markdown += "\n";
  });
  
  return markdown;
}

function extractClaudeResponse(claudeMessage) {
  let responseMarkdown = '';
  
  // Find all grid-cols-1 elements within the response
  const contentGrids = claudeMessage.querySelectorAll('.grid-cols-1');
  
  contentGrids.forEach(grid => {
    // Check if this grid is inside a thinking block container
    const parentContainer = grid.closest('.transition-all');
    
    // Skip if it's in a collapsible thinking block (has the expand/collapse button)
    if (parentContainer && parentContainer.querySelector('button[class*="group/row"]')) {
      return; // Skip thinking blocks
    }
    
    // Also skip if it's nested inside another grid we're already processing
    if (grid.closest('.grid-cols-1') !== grid) {
      return;
    }
    
    const result = { markdown: '' };
    processContent(grid, result);
    responseMarkdown += result.markdown;
  });
  
  return responseMarkdown;
}

function isThinkingBlock(element) {
  // transition-all is unique to thinking blocks
  return element.classList.contains('transition-all');
}
function isArtifactBlock(element) {
  // Artifact blocks have pt-3 pb-3 classes and contain artifact-related content
  const classes = element.classList;
  return classes.contains('pt-3') && classes.contains('pb-3') ||
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
downloadMarkdown(extractConversation(), 'claude_conversation.md');