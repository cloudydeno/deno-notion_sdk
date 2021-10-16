#!/usr/bin/env -S deno run --allow-env=NOTION_KEY --allow-net=api.notion.com
import { Client } from "../../src/mod.ts"
import {
  ListBlockChildrenResponse,
  QueryDatabaseResponse,
} from "../../src/api-endpoints.ts"

import { assertEquals } from "https://deno.land/std@0.105.0/testing/asserts.ts";

const notion = new Client({
  auth: Deno.env.get("NOTION_KEY"),
});

const { results: dbs } = await notion.search({
  query: 'Blog Posts',
  filter: {
    property: 'object',
    value: 'database',
  },
});
const db = dbs[0];

const { results } = await notion.databases.query({
  database_id: db.id,
});

for (const page of results) {
  const {title} = Object
    .values(page.properties)
    .find(x => x.type == 'title') as (QueryDatabaseResponse['results'][number]['properties'][string] & {type: 'title'});
  console.log('#', formText(title));
  console.log();

  for await (const block of allChildren(page.id)) {
    await writeBlock(block, '');
    console.log();
  }

  console.log('\n\n');
}

async function writeBlock(block: ListBlockChildrenResponse['results'][number], indent: string) {
  if (block.type === 'paragraph') {
    assertEquals(block.has_children, false);
    console.log(indent + formText(block.paragraph.text));
  } else if (block.type === 'heading_1') {
    assertEquals(block.has_children, false);
    console.log(indent + '## '+formText(block.heading_1.text));
  } else if (block.type === 'heading_2') {
    assertEquals(block.has_children, false);
    console.log(indent + '### '+formText(block.heading_2.text));
  } else if (block.type === 'heading_3') {
    assertEquals(block.has_children, false);
    console.log(indent + '#### '+formText(block.heading_3.text));
  } else if (block.type === 'quote') {
    assertEquals(block.has_children, false);
    console.log(indent + '> '+formText(block.quote.text));
  } else if (block.type === 'code') {
    assertEquals(block.has_children, false);
    assertEquals(block.code.text.length, 1);
    assertEquals(block.code.text[0].type, 'text');
    console.log(indent + '```'+block.code.language);
    console.log(block.code.text[0].plain_text.replace(/^/m, indent));
    console.log(indent + '```');
  } else if (block.type === 'numbered_list_item') {
    console.log(indent + '1.  ' + formText(block.numbered_list_item.text));
    if (block.has_children) {
      const children = await notion.blocks.children.list({
        block_id: block.id,
      });
      for (const child of children.results) {
        console.log();
        await writeBlock(child, indent+'    ');
      }
    }
  } else if (block.type === 'bulleted_list_item') {
    console.log(indent + '*   ' + formText(block.bulleted_list_item.text));
    if (block.has_children) {
      for await (const child of allChildren(block.id)) {
        console.log();
        await writeBlock(child, indent+'    ');
      }
    }
  } else if (block.type === 'image') {
    assertEquals(block.has_children, false);
    if (block.image.type === 'external') {
      console.log(indent + `![${formText(block.image.caption)}](${block.image.external.url})`);
    } else if (block.image.type === 'file') {
      // TODO: register images for uploading
      console.log(indent + `![${formText(block.image.caption)}](${block.image.file.url})`);
    }
  } else {
    console.log(indent + 'TODO:', block.id, block.type, block.has_children);
  }
}

function formText(texts: (ListBlockChildrenResponse['results'][number] & {type: 'paragraph'})['paragraph']['text']) {
  const bits = new Array<string>();
  for (const text of texts) {
    assertEquals(text.type, 'text');
    assertEquals(text.annotations.color, 'default');
    if (text.type === 'text') {
      if (text.text.link) {
        bits.push(`[${text.text.content}](${text.text.link.url})`);
      } else if (text.annotations.code) {
        bits.push('`'+text.text.content.replace(/`/g,'\\`')+'`');
      } else if (text.annotations.bold && text.annotations.italic) {
        bits.push('***'+text.text.content+'***');
      } else if (text.annotations.italic) {
        bits.push('*'+text.text.content+'*');
      } else if (text.annotations.bold) {
        bits.push('**'+text.text.content+'**');
      } else if (text.annotations.underline) {
        bits.push('<ins>'+text.text.content+'</ins>');
      } else if (text.annotations.strikethrough) {
        bits.push('~~'+text.text.content+'~~');
      } else {
        bits.push(text.text.content);
      }
    }
  }
  return bits.join('');
}

async function* allChildren(parentId: string) {
  let result = await notion.blocks.children.list({
    block_id: parentId,
  });
  yield* result.results;

  while (result.has_more) {
    if (!result.next_cursor) throw new Error(
      `next_cursor missing on response with has_more`);

    result = await notion.blocks.children.list({
      block_id: parentId,
      start_cursor: result.next_cursor,
    });
    yield* result.results;
  }
}
