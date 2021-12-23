import {
  AppriseNotifier,
  DiscordNotifier,
  EmailNotifier,
  LocalNotifier,
  TelegramNotifier,
} from './notifiers';
import {
  config,
  DiscordConfig,
  EmailConfig,
  LocalConfig,
  NotificationType,
  TelegramConfig,
  AppriseConfig,
} from './common/config';
import L from './common/logger';
import { NotificationReason } from './interfaces/notification-reason';
import puppeteer, { getDevtoolsUrl, launchArgs } from './common/puppeteer';
import { getLocaltunnelUrl } from './common/localtunnel';

export async function sendNotification(
  url: string,
  accountEmail: string,
  reason: NotificationReason
): Promise<void> {
  const account = config.accounts.find((acct) => acct.email === accountEmail);
  const notifierConfigs = account?.notifiers || config.notifiers;
  if (!notifierConfigs || !notifierConfigs.length) {
    L.warn(
      {
        url,
        accountEmail,
        reason,
      },
      `No notifiers configured globally, or for the account. This log is all you'll get`
    );
    return;
  }
  const notifiers = notifierConfigs.map((notifierConfig) => {
    switch (notifierConfig.type) {
      case NotificationType.DISCORD:
        return new DiscordNotifier(notifierConfig as DiscordConfig);
      case NotificationType.EMAIL:
        return new EmailNotifier(notifierConfig as EmailConfig);
      case NotificationType.LOCAL:
        return new LocalNotifier(notifierConfig as LocalConfig);
      case NotificationType.TELEGRAM:
        return new TelegramNotifier(notifierConfig as TelegramConfig);
      case NotificationType.APPRISE:
        return new AppriseNotifier(notifierConfig as AppriseConfig);
      default:
        throw new Error(`Unexpected notifier config: ${notifierConfig.type}`);
    }
  });

  await Promise.all(
    notifiers.map((notifier) => notifier.sendNotification(url, accountEmail, reason))
  );
}

export async function testNotifiers(): Promise<void> {
  L.info('Testing all configured notifiers');
  const browser = await puppeteer.launch(launchArgs);
  const page = await browser.newPage();
  L.trace(getDevtoolsUrl(page));
  await page.goto('https://claabs.github.io/epicgames-freegames-node/test.html');
  let url = await page.openPortal();
  if (config.webPortalConfig?.localtunnel) {
    url = await getLocaltunnelUrl(url);
  }
  const accountEmails = config.accounts.map((acct) =>
    sendNotification(url, acct.email, NotificationReason.TEST)
  );
  await Promise.all(accountEmails);
  L.info('Test notifications sent. Waiting for test page interaction...');
  try {
    await page.waitForSelector('#complete', {
      visible: true,
      timeout: config.notificationTimeoutHours * 60 * 60 * 1000,
    });
    L.info('Notification test complete');
  } catch (err) {
    L.warn('Test notification timed out. Continuing...');
  }
  await browser.close();
}