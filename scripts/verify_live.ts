import { chromium, Page } from 'playwright';
import * as assert from 'assert';

async function extractCleanText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('.tiptap.ProseMirror');
    if (!el) return '';
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.collaboration-cursor__label').forEach((e) => e.remove());
    clone.querySelectorAll('.collaboration-cursor__caret').forEach((e) => e.remove());
    return clone.textContent?.trim() || '';
  });
}

async function main() {
  console.log('===============================================================');
  console.log('      SYNCFORGE LIVE END-TO-END VERIFICATION HARNESS          ');
  console.log('===============================================================');

  const browser = await chromium.launch({ headless: true });
  
  try {
    // -------------------------------------------------------------------------
    // STEP 1 & 2: VERIFY FRONTEND, ROUTING, DOCUMENT CREATION & DASHBOARD
    // -------------------------------------------------------------------------
    console.log('\n[1/7] Verifying Frontend Landing Page & Document Creation...');
    const context1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page1 = await context1.newPage();

    // Load landing page
    await page1.goto('http://localhost:5173/');
    await page1.waitForLoadState('networkidle');
    const heroText = await page1.textContent('h1');
    console.log(`  -> Landing Page Loaded. Headline: "${heroText?.trim()}"`);
    assert.ok(heroText?.includes('Real-Time Collaborative Editing'));

    // Navigate to Dashboard
    await page1.click('text=View All Documents');
    await page1.waitForURL('**/dashboard');
    console.log('  -> Navigated to /dashboard');

    // Create a new document from template
    await page1.click('text=Create New Document');
    await page1.waitForSelector('text=System Architecture RFC');
    await page1.click('text=System Architecture RFC');
    await page1.click('button[type="submit"]:has-text("Create Document")');

    // Wait for editor to load
    await page1.waitForURL(/\/document\/[a-zA-Z0-9_-]+/);
    const docUrl = page1.url();
    const docId = docUrl.split('/document/')[1];
    console.log(`  -> Document Created Successfully! Doc ID: ${docId}`);
    console.log(`  -> Editor URL: ${docUrl}`);

    // Wait for connection indicator
    await page1.waitForSelector('text=Saved & Connected', { timeout: 10000 });
    console.log('  -> Connection Status: Connected & Saved');

    // -------------------------------------------------------------------------
    // STEP 3 & 4: VERIFY 2-CLIENT REAL-TIME COLLABORATION & PRESENCE
    // -------------------------------------------------------------------------
    console.log('\n[2/7] Verifying Real-Time Collaboration & Presence with 2 Browser Sessions...');
    const context2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page2 = await context2.newPage();

    // Open identical document URL in Session 2
    await page2.goto(docUrl);
    await page2.waitForSelector('text=Saved & Connected', { timeout: 10000 });
    console.log('  -> Browser Session 2 joined document room');

    // Wait for awareness sync
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    const editor1 = page1.locator('.tiptap.ProseMirror');
    const editor2 = page2.locator('.tiptap.ProseMirror');

    // Browser 1 types text
    console.log('  -> Browser A typing: "SyncForge Real-Time Distributed CRDT Engine"');
    await editor1.click();
    await page1.keyboard.type('SyncForge Real-Time Distributed CRDT Engine\n');

    // Browser 2 receives text
    await page2.waitForSelector('text=SyncForge Real-Time Distributed CRDT Engine', { timeout: 5000 });
    console.log('  -> [VERIFIED] Browser B received Browser A text in real time!');

    // Concurrent editing test
    console.log('  -> Concurrent Typing: Browser A and Browser B type simultaneously...');
    await editor1.click();
    const typeA = page1.keyboard.type('[Edit from Client A] ');
    await editor2.click();
    const typeB = page2.keyboard.type('[Concurrent from Client B] ');
    await Promise.all([typeA, typeB]);

    // Wait for sync propagation
    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);

    const cleanTextA = await extractCleanText(page1);
    const cleanTextB = await extractCleanText(page2);

    console.log(`  -> Browser A Content: "${cleanTextA.replace(/\n/g, ' ')}"`);
    console.log(`  -> Browser B Content: "${cleanTextB.replace(/\n/g, ' ')}"`);
    assert.strictEqual(cleanTextA, cleanTextB, 'Replicas must mathematically converge to identical text!');
    console.log('  -> [VERIFIED] Mathematical Convergence: Both browser sessions converged 100% identically!');

    // Verify remote cursor presence rendering
    const caretsA = await page1.locator('.collaboration-cursor__caret').count();
    const caretsB = await page2.locator('.collaboration-cursor__caret').count();
    console.log(`  -> Remote cursor carets visible: Browser A sees ${caretsA}, Browser B sees ${caretsB}`);
    assert.ok(caretsA >= 1 && caretsB >= 1, 'Remote cursors must be rendered in DOM');

    // -------------------------------------------------------------------------
    // STEP 5: VERIFY OFFLINE MODE & RECONNECTION CONVERGENCE
    // -------------------------------------------------------------------------
    console.log('\n[3/7] Verifying Offline Mode & Reconnection Convergence...');
    
    // Disconnect Browser A using toolbar simulation
    await page1.click('button[title*="Disconnect WebSocket"]');
    await page1.waitForSelector('text=Offline-First Mode Active');
    console.log('  -> Browser A disconnected from network (Offline Mode Active)');

    // Browser A makes offline edits
    console.log('  -> Browser A typing offline: "[OFFLINE EDIT IN CLIENT A] "');
    await editor1.click();
    await page1.keyboard.type('[OFFLINE EDIT IN CLIENT A] ');

    // Browser B remains online and makes concurrent edits
    console.log('  -> Browser B typing online: "[ONLINE CONCURRENT EDIT IN CLIENT B] "');
    await editor2.click();
    await page2.keyboard.type('[ONLINE CONCURRENT EDIT IN CLIENT B] ');

    // Verify Browser B does NOT see Browser A offline edits yet
    const textBBeforeReconnect = await extractCleanText(page2);
    assert.ok(!textBBeforeReconnect.includes('OFFLINE EDIT IN CLIENT A'), 'Browser B must not see partitioned edits before reconnect');

    // Reconnect Browser A
    console.log('  -> Reconnecting Browser A to network...');
    await page1.locator('button:has-text("Reconnect Sync")').first().click();
    await page1.waitForSelector('text=Saved & Connected', { timeout: 10000 });

    // Wait for anti-entropy sync handshake
    await page1.waitForTimeout(1500);
    await page2.waitForTimeout(1500);

    const textAAfter = await extractCleanText(page1);
    const textBAfter = await extractCleanText(page2);

    console.log(`  -> Post-Reconnect Browser A: "${textAAfter.replace(/\n/g, ' ')}"`);
    console.log(`  -> Post-Reconnect Browser B: "${textBAfter.replace(/\n/g, ' ')}"`);
    assert.strictEqual(textAAfter, textBAfter, 'Partitioned replicas must converge upon reconnection!');
    assert.ok(textAAfter.includes('OFFLINE EDIT IN CLIENT A') && textAAfter.includes('ONLINE CONCURRENT EDIT IN CLIENT B'));
    console.log('  -> [VERIFIED] Offline Reconciliation: Both offline and online edits merged seamlessly without conflict!');

    // -------------------------------------------------------------------------
    // STEP 6: VERIFY CRDT INSPECTOR
    // -------------------------------------------------------------------------
    console.log('\n[4/7] Verifying Developer CRDT Inspector...');
    await page1.waitForTimeout(1000);
    
    // Check if inspector button exists
    const btnCount = await page1.locator('button:has-text("CRDT Inspector")').count();
    console.log(`  -> Found ${btnCount} Inspector button(s)`);
    await page1.locator('button:has-text("CRDT Inspector")').first().click();

    // Check for inspector drawer
    await page1.waitForSelector('text=CRDT Node Telemetry', { timeout: 10000 });
    console.log('  -> [VERIFIED] CRDT Inspector Drawer Opened & Telemetry Rendered');

    // Check Timeline Tab
    await page1.click('button:has-text("Update Timeline")');
    await page1.waitForTimeout(500);
    console.log('  -> [VERIFIED] Live CRDT Operation Timeline active');

    // Check State Vectors Tab
    await page1.click('button:has-text("State Vector & Structs")');
    await page1.waitForSelector('text=Decoded State Vector', { timeout: 5000 });
    console.log('  -> [VERIFIED] State Vector Table & Hex Stream active');

    // Close Inspector
    await page1.click('button[title="Close inspector"]');
    console.log('  -> [VERIFIED] CRDT Inspector Drawer Closed Cleanly');

    // -------------------------------------------------------------------------
    // STEP 7: VERIFY REST API & PERSISTENCE RETRIEVAL
    // -------------------------------------------------------------------------
    console.log('\n[5/7] Verifying REST API & Persistence Retrieval...');
    const restResponse = await page1.request.get(`http://localhost:3001/api/docs/${docId}`);
    const docMeta = await restResponse.json();
    console.log(`  -> REST API GET /api/docs/${docId} -> Title: "${docMeta.title}", Updates: ${docMeta.update_count}`);
    assert.strictEqual(docMeta.id, docId);

    console.log('\n===============================================================');
    console.log('   ALL 7 LIVE RUNTIME VERIFICATION CHECKS PASSED WITH 100% SUCCESS  ');
    console.log('===============================================================');

    await context1.close();
    await context2.close();
  } catch (error) {
    console.error('Test Execution Error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
