require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = (process.env.PREFIX || '!').trim();

if (!TOKEN) {
  console.error('❌ Thiếu DISCORD_TOKEN trong .env');
  process.exit(1);
}

// ===== Utils: chuẩn hoá chữ cái, bỏ dấu =====
const stripAccents = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const asciiOnly = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// ===== Load dictionary =====
const dictPath = path.join(__dirname, 'words_vi.txt');
let DICT = new Set();
try {
  const raw = fs.readFileSync(dictPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const w = asciiOnly(line.trim());
    if (w) DICT.add(w);
  });
  if (DICT.size === 0) console.warn('⚠️ Từ điển rỗng, thêm từ vào words_vi.txt nhé.');
} catch (e) {
  console.warn('⚠️ Không đọc được words_vi.txt, dùng dict tối thiểu.');
  DICT = new Set(['anh', 'ha', 'an', 'nam', 'mien', 'noi', 'im', 'mai', 'yeu', 'uom', 'meo', 'ong', 'gio']);
}

// ===== Game state =====
const game = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`✅ Online: ${client.user.tag}`);
});

function ensureGuild(guildId) {
  if (!game.has(guildId)) game.set(guildId, { channelId: null, lastChar: null, used: new Set() });
  return game.get(guildId);
}

function pickBotWord(startChar, used) {
  const candidates = [];
  for (const w of DICT) if (w.startsWith(startChar) && !used.has(w)) candidates.push(w);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function lastAsciiChar(word) {
  const a = asciiOnly(word);
  return a[a.length - 1] || null;
}

client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const g = ensureGuild(msg.guild.id);

  // ===== Commands =====
  if (msg.content.startsWith(PREFIX)) {
    const [cmd, ...rest] = msg.content.slice(PREFIX.length).trim().split(/\s+/);

    if (cmd === 'help') {
      msg.reply(
        `📘 **Hướng dẫn**\n` +
          `• \`${PREFIX}setchannel\` — đặt kênh hiện tại làm sân chơi.\n` +
          `• \`${PREFIX}start [chữ]\` — bắt đầu game (chữ bắt đầu tuỳ chọn).\n` +
          `• \`${PREFIX}end\` — kết thúc game.\n` +
          `• Gõ \`một từ\` để chơi. Bot sẽ nối tiếp.`
      );
      return;
    }

    if (cmd === 'setchannel') {
      g.channelId = msg.channel.id;
      msg.reply('✅ Đã đặt kênh này làm sân chơi nối từ.');
      return;
    }

    if (cmd === 'start') {
      if (!g.channelId) g.channelId = msg.channel.id;
      const seed = rest.join(' ').trim();
      g.used.clear();
      if (seed) {
        g.lastChar = lastAsciiChar(seed);
        msg.reply(`🎮 Bắt đầu! Từ đầu tiên: **${seed}**. Bot sẽ đòi chữ bắt đầu bằng **${g.lastChar.toUpperCase()}**.`);
      } else {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        g.lastChar = letters[Math.floor(Math.random() * letters.length)];
        msg.reply(`🎮 Bắt đầu! Chữ cái yêu cầu: **${g.lastChar.toUpperCase()}**. Bạn đi trước.`);
      }
      return;
    }

    if (cmd === 'end') {
      g.lastChar = null;
      g.used.clear();
      msg.reply('🛑 Kết thúc game. Gõ `!start` để chơi lại.');
      return;
    }

    return;
  }

  // ===== Gameplay =====
  if (!g.channelId || msg.channel.id !== g.channelId) return;
  if (!g.lastChar) return;

  const playerWordRaw = msg.content.trim();
  const playerAscii = asciiOnly(playerWordRaw);
  if (!playerAscii || /\s/.test(playerAscii)) return;

  if (!DICT.has(playerAscii)) {
    return msg.reply('❌ Từ không có trong từ điển.');
  }

  if (g.used.has(playerAscii)) {
    return msg.reply('♻️ Từ này dùng rồi.');
  }

  const required = g.lastChar;
  const givenFirst = playerAscii[0];
  if (required && givenFirst !== required) {
    return msg.reply(`❌ Sai luật! Từ phải bắt đầu bằng **${required.toUpperCase()}**.`);
  }

  g.used.add(playerAscii);
  const nextStart = lastAsciiChar(playerAscii);

  const botWord = pickBotWord(nextStart, g.used);
  if (!botWord) {
    g.lastChar = null;
    return msg.reply(`🎉 Bạn thắng! Bot hết từ bắt đầu bằng **${nextStart.toUpperCase()}**.`);
  }

  g.used.add(botWord);
  g.lastChar = lastAsciiChar(botWord);

  await msg.reply(`🤖 ${botWord}\n➡️ Chữ tiếp theo: **${g.lastChar.toUpperCase()}**`);
});

client.login(TOKEN);
