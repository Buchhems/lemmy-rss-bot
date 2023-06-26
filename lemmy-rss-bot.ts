import LemmyBot from 'lemmy-bot';
import Parser from 'rss-parser';
import moment from 'moment';
import sqlite3 from 'sqlite3';

// federated instance to use
const instanceName = 'feddit.de';

// bot credentials (create bot account first)
const botCredentials = {
  username: 'bot-name',
  password: 'password'
};

// RSS feed URLs to get articles from
const feedUrls = [
  'https://www.abc.de/feed',
  'https://www.def.de/feed'
];

// Define the community name where to post
const communityName = 'communityname';

// Define the number of days to consider for filtering
const maxDaysOld = 7;

// Initialize SQLite database to store URLs to prevent double posting (processed items)
const db = new sqlite3.Database('lemmy-bot.db');

// Create table for storing processed item identifiers
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS processed_items (
      identifier TEXT PRIMARY KEY
    )
  `);
});

// Function to check if an item has already been processed
const isItemProcessed = (identifier) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM processed_items WHERE identifier = ?', [identifier], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
};

// Function to mark an item as processed
const markItemAsProcessed = (identifier) => {
  db.run('INSERT INTO processed_items (identifier) VALUES (?)', [identifier]);
};

// Function to put it all together
const doTheThing = async (botActions) => {
  // Task to perform
  console.log('Task executed');

  const parser = new Parser();

  try {
    for (const feedUrl of feedUrls) {
      const feed = await parser.parseURL(feedUrl);
      const cutoffDate = moment().subtract(maxDaysOld, 'days');

      for (const item of feed.items) {
        const itemDate = moment(item.isoDate);

        if (itemDate.isSameOrAfter(cutoffDate)) {
          const identifier = item.guid || item.link;

          if (await isItemProcessed(identifier)) {
            console.log('Skipping already processed item:', item.title);
            continue;
          }

          console.log('New RSS item:', item.title);

          // Get the community ID based on the community name
          const communityId = await botActions.getCommunityId({
            instance: instanceName,
            name: communityName
          });

          if (communityId) {
            // Process and handle the new RSS item
            const createPostForm = {
              name: item.title,
              url: item.link,
              body: item.contentSnippet,
              community_id: communityId
            };

            await botActions.createPost(createPostForm);
            markItemAsProcessed(identifier);
          } else {
            console.log('Community not found:', communityName);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching or parsing RSS feed:', error);
  }
};

const bot = new LemmyBot({
  instance: instanceName,
  credentials: botCredentials,
  connection: {
    minutesBeforeRetryConnection: 5,
    secondsBetweenPolls: 10,
    minutesUntilReprocess: 60
  },
  federation: 'local',
  schedule: [
    {
      cronExpression: '0 * * * *', // Run once an hour
      doTask: doTheThing,
      timezone: 'Europe/Berlin',
      runAtStart: true
    }
  ],
  dbFile: communityName + '-lemmy-bot-db.sqlite3'
});

bot.start();
