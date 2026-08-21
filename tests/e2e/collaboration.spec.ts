import { test, expect } from '@playwright/test';

test.describe('SyncForge Real-Time CRDT Collaborative Editing & Presence E2E', () => {
  test('1. Two separate browser tabs edit simultaneously, show remote cursors, and converge', async ({ browser }) => {
    const docId = `e2e_crdt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docUrl = `/document/${docId}`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto(docUrl);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(docUrl);

    const editorA = pageA.locator('.ProseMirror');
    const editorB = pageB.locator('.ProseMirror');

    await expect(editorA).toBeVisible({ timeout: 10000 });
    await expect(editorB).toBeVisible({ timeout: 10000 });

    await expect(pageA.getByText('Saved & Connected').first()).toBeVisible({ timeout: 5000 });
    await expect(pageB.getByText('Saved & Connected').first()).toBeVisible({ timeout: 5000 });

    // User A types initial text
    await editorA.click();
    await pageA.keyboard.type('Distributed CRDT Architecture with Yjs');

    // Verify User B receives changes in real time
    await expect(editorB).toContainText('Distributed CRDT Architecture with Yjs', {
      timeout: 5000,
    });

    // User B types additional content concurrently
    await editorB.click();
    await pageB.keyboard.press('Enter');
    await pageB.keyboard.type('Real-Time Strong Eventual Consistency');

    // Verify User A receives User B's changes in real time
    await expect(editorA).toContainText('Real-Time Strong Eventual Consistency', {
      timeout: 5000,
    });

    // Verify collaborator cursor carets are rendered
    await expect(pageA.locator('.collaboration-cursor__caret')).toBeVisible({ timeout: 5000 });
    await expect(pageB.locator('.collaboration-cursor__caret')).toBeVisible({ timeout: 5000 });

    const extractCleanParagraphs = (page: typeof pageA) =>
      page.evaluate(() => {
        return Array.from(document.querySelectorAll('.ProseMirror > p')).map((p) => {
          const clone = p.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('.collaboration-cursor__label').forEach((el) => el.remove());
          clone.querySelectorAll('.collaboration-cursor__caret').forEach((el) => el.remove());
          return clone.textContent?.trim() || '';
        }).filter(Boolean);
      });

    const paragraphsA = await extractCleanParagraphs(pageA);
    const paragraphsB = await extractCleanParagraphs(pageB);

    expect(paragraphsA).toEqual(paragraphsB);
    expect(paragraphsA.some((p) => p.includes('Distributed CRDT Architecture with Yjs'))).toBe(true);
    expect(paragraphsA.some((p) => p.includes('Real-Time Strong Eventual Consistency'))).toBe(true);

    await contextA.close();
    await contextB.close();
  });

  test('2. Three simultaneous browser sessions with presence, remote cursors, and disconnect cleanup', async ({ browser }) => {
    const docId = `presence_3users_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docUrl = `/document/${docId}`;

    // Launch Session 1 (Alice)
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto(docUrl);

    // Launch Session 2 (Bob)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(docUrl);

    // Launch Session 3 (Charlie)
    const context3 = await browser.newContext();
    const page3 = await context3.newPage();
    await page3.goto(docUrl);

    const editor1 = page1.locator('.ProseMirror');
    const editor2 = page2.locator('.ProseMirror');
    const editor3 = page3.locator('.ProseMirror');

    await expect(editor1).toBeVisible({ timeout: 10000 });
    await expect(editor2).toBeVisible({ timeout: 10000 });
    await expect(editor3).toBeVisible({ timeout: 10000 });

    await expect(page1.getByText('Saved & Connected')).toBeVisible({ timeout: 10000 });
    await expect(page2.getByText('Saved & Connected')).toBeVisible({ timeout: 10000 });
    await expect(page3.getByText('Saved & Connected')).toBeVisible({ timeout: 10000 });

    // Verify all 3 sessions reflect "3 online"
    await expect(page1.getByText(/3 online/i)).toBeVisible({ timeout: 10000 });
    await expect(page2.getByText(/3 online/i)).toBeVisible({ timeout: 10000 });
    await expect(page3.getByText(/3 online/i)).toBeVisible({ timeout: 10000 });

    // Session 1 writes Section 1
    await editor1.click();
    await page1.keyboard.type('Section 1: Distributed Concurrency Engine');

    // Session 2 writes Section 2
    await editor2.click();
    await page2.keyboard.press('Enter');
    await page2.keyboard.type('Section 2: High Throughput WebSocket Replication');

    // Session 3 writes Section 3
    await editor3.click();
    await page3.keyboard.press('Enter');
    await page3.keyboard.type('Section 3: Zero-Conflict State Vector Convergence');

    // Wait for all 3 editors to synchronize and contain all 3 sections
    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);
    await page3.waitForTimeout(1000);

    const getClean = (p: any) =>
      p.evaluate(() => {
        const el = document.querySelector('.ProseMirror');
        if (!el) return '';
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.collaboration-cursor__label').forEach((e) => e.remove());
        clone.querySelectorAll('.collaboration-cursor__caret').forEach((e) => e.remove());
        return clone.textContent || '';
      });

    const [t1, t2, t3] = await Promise.all([getClean(page1), getClean(page2), getClean(page3)]);
    expect(t1).toContain('Section 1: Distributed Concurrency Engine');
    expect(t1.length).toBeGreaterThan(60);
    // All 3 browser sessions must have 100% identical converged document state
    expect(t1).toEqual(t2);
    expect(t2).toEqual(t3);

    // Verify remote cursors are visible on page 1
    await expect(page1.locator('.collaboration-cursor__caret').first()).toBeVisible({ timeout: 5000 });

    // Session 3 closes / disconnects
    await context3.close();

    // Verify Session 1 and Session 2 update presence counter to "2 online"
    await expect(page1.getByText('2 online')).toBeVisible({ timeout: 8000 });
    await expect(page2.getByText('2 online')).toBeVisible({ timeout: 8000 });

    await context1.close();
    await context2.close();
  });

  test('3. Offline editing, concurrent edits while partitioned, and reconnection convergence', async ({ browser }) => {
    const docId = `e2e_offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docUrl = `/document/${docId}`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto(docUrl);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(docUrl);

    const editorA = pageA.locator('.ProseMirror');
    const editorB = pageB.locator('.ProseMirror');

    await expect(editorA).toBeVisible({ timeout: 10000 });
    await expect(editorB).toBeVisible({ timeout: 10000 });

    // Initial baseline text
    await editorA.click();
    await pageA.keyboard.type('Baseline synchronized document section.');
    await expect(editorB).toContainText('Baseline synchronized document section.', {
      timeout: 5000,
    });

    // Tab A simulates going Offline
    await pageA.getByRole('button', { name: /Simulate Offline/i }).first().click();
    await expect(pageA.getByText('Offline Mode').first()).toBeVisible();

    // Tab A types offline edits
    await editorA.click();
    await pageA.keyboard.press('Enter');
    await pageA.keyboard.type('[User A Offline Draft Note]');

    // Tab B types concurrent online edits
    await editorB.click();
    await pageB.keyboard.press('Enter');
    await pageB.keyboard.type('[User B Concurrent Online Addition]');

    // Verify Tab B does NOT have Tab A's offline text yet
    await expect(editorB).not.toContainText('[User A Offline Draft Note]');

    // Tab A reconnects
    await pageA.getByRole('button', { name: /Reconnect Sync/i }).first().click();
    await expect(pageA.getByText('Saved & Connected').first()).toBeVisible({ timeout: 5000 });

    // Verify both tabs converge and contain BOTH changes
    await expect(editorA).toContainText('[User B Concurrent Online Addition]', {
      timeout: 5000,
    });
    await expect(editorB).toContainText('[User A Offline Draft Note]', {
      timeout: 5000,
    });

    const extractCleanParagraphs = (page: typeof pageA) =>
      page.evaluate(() => {
        return Array.from(document.querySelectorAll('.ProseMirror > p')).map((p) => {
          const clone = p.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('.collaboration-cursor__label').forEach((el) => el.remove());
          clone.querySelectorAll('.collaboration-cursor__caret').forEach((el) => el.remove());
          return clone.textContent?.trim() || '';
        }).filter(Boolean);
      });

    const paragraphsA = await extractCleanParagraphs(pageA);
    const paragraphsB = await extractCleanParagraphs(pageB);

    expect(paragraphsA).toEqual(paragraphsB);

    await contextA.close();
    await contextB.close();
  });
});
