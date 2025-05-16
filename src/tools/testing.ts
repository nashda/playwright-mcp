/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from 'zod';
import { defineTool } from './tool.js';
import { locatorOrSelectorAsSelector } from '../upstream/locatorParser.js';

const generateTestSchema = z.object({
  name: z.string().describe('The name of the test'),
  description: z.string().describe('The description of the test'),
  steps: z.array(z.string()).describe('The steps of the test'),
});

const generateTest = defineTool({
  capability: 'testing',

  schema: {
    name: 'browser_generate_playwright_test',
    title: 'Generate a Playwright test',
    description: 'Generate a Playwright test for given scenario',
    inputSchema: generateTestSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    return {
      resultOverride: {
        content: [{
          type: 'text',
          text: instructions(params),
        }],
      },
      code: [],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

const instructions = (params: { name: string, description: string, steps: string[] }) => [
  `## Instructions`,
  `- You are a playwright test generator.`,
  `- You are given a scenario and you need to generate a playwright test for it.`,
  '- DO NOT generate test code based on the scenario alone. DO run steps one by one using the tools provided instead.',
  '- Only after all steps are completed, emit a Playwright TypeScript test that uses @playwright/test based on message history',
  '- Save generated test file in the tests directory',
  `Test name: ${params.name}`,
  `Description: ${params.description}`,
  `Steps:`,
  ...params.steps.map((step, index) => `- ${index + 1}. ${step}`),
].join('\n');


const validateLocatorSchema = z.object({
  locator: z.string().describe('Locator to validate. ARIA locators are prefered, e.g. "getByRole(\'button\', { name: \'Sign in\' })". Do not include the "page." prefix.'),
  element: z.string().describe('Human-readable element description used to obtain permission to interact with the element'),
  ref: z.string().describe('Exact target element reference from the page snapshot that will be used to validate the locator'),
  testIdAttributeName: z.string().optional().describe('Optional test ID attribute name to use for locator generation (by default, "data-testid" is used)'),
});

const validateLocator = defineTool({
  capability: 'testing',
  schema: {
    name: 'browser_validate_locator',
    title: 'Validate locator',
    description: `Checks if the locator evaluates into the specified ref.`,
    inputSchema: validateLocatorSchema,
    type: 'readOnly'
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const snapshot = tab.snapshotOrDie();

    const refLocator = snapshot.refLocator(params.ref);

    const selector = locatorOrSelectorAsSelector('javascript', params.locator, params.testIdAttributeName ?? 'data-testid');
    const locator = tab.page.locator(selector);

    const text = await locator.evaluateAll((elems, refElem) => {
      if (!refElem)
        return ['No reference element found'];
      if (elems.length === 0)
        return ['Locator does not match any elements'];
      if (elems.length === 1 && elems[0] === refElem)
        return ['Locator is valid'];
      if (elems.length > 1 && elems.includes(refElem))
        return ['Locator is ambiguous, it matches the reference element but also other elements'];
      return ['Locator is invalid, it does not match the reference element'];
    }, await refLocator.elementHandle());

    return {
      resultOverride: {
        content: [{
          type: 'text',
          text: text.join('\n'),
        }],
      },
      code: [],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

export default [
  generateTest,
  validateLocator,
];
