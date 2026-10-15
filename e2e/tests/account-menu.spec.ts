import {test,expect} from '@playwright/test';

test('account dropdown sits beside clear stats, fits any screen and supports keyboard and outside dismissal',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('st-stats',JSON.stringify({total:1,correct:0})));
  await page.goto('/');
  const trigger=page.getByRole('button',{name:'Account',exact:true});
  const panel=page.getByRole('dialog',{name:'Account',exact:true});
  await expect(panel).not.toBeVisible();
  await expect(page.locator('.header-actions').getByRole('button',{name:'clear stats',exact:true})).toBeVisible();
  await expect(page.locator('.header-actions').getByRole('button',{name:'Account',exact:true})).toBeVisible();
  for(const [width,height] of [[1440,900],[768,900],[375,812],[320,568],[568,320]]) {
    await page.setViewportSize({width,height});
    await trigger.click();
    await expect(panel).toBeVisible();
    const box=await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x+box!.width).toBeLessThanOrEqual(width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y+box!.height).toBeLessThanOrEqual(height);
    if(height===320) expect(box!.height).toBeGreaterThan(200);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await panel.getByRole('button',{name:'Register',exact:true}).scrollIntoViewIfNeeded();
    await expect(panel.getByRole('button',{name:'Register',exact:true})).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
  await page.setViewportSize({width:375,height:812});
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('username',{exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(panel).not.toBeVisible();
  await trigger.click();
  await page.locator('.brand').click();
  await expect(panel).not.toBeVisible();

  await trigger.click();
  await page.getByPlaceholder('username',{exact:true}).fill(`missing_${crypto.randomUUID().slice(0,8)}`);
  await page.getByPlaceholder('password',{exact:true}).fill('wrongpassword');
  await page.getByPlaceholder('password',{exact:true}).press('Enter');
  await expect(panel.getByRole('alert')).toContainText('invalid credentials');
  await expect(panel).toBeVisible();
  await page.setViewportSize({width:320,height:568});
  const resized=await panel.boundingBox();
  expect(resized!.x+resized!.width).toBeLessThanOrEqual(320);
  expect(resized!.y+resized!.height).toBeLessThanOrEqual(568);
});
