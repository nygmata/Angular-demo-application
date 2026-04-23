import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  transform(value: string | undefined): string {
    if (!value) return '';

    // Check if the string is likely JSON
    if (this.isJson(value)) {
      try {
        const parsed = JSON.parse(value);
        const formattedJson = JSON.stringify(parsed, null, 2);
        const html = `<pre><code class="language-json">${formattedJson}</code></pre>`;
        return DOMPurify.sanitize(html);
      } catch (e) {
        // Fall back to markdown if JSON parsing fails
      }
    }

    const html = marked.parse(value) as string;
    return DOMPurify.sanitize(html);
  }

  private isJson(str: string): boolean {
    str = str.trim();
    return (str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'));
  }
}
