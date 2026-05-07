const MAX_ATTACHMENTS_PER_MESSAGE = 4
const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024
const MAX_FILE_SIZE = 3 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600
const MAX_ATTACHMENT_DATA_URL_LENGTH = 2_500_000

export const CHAT_ATTACHMENT_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.zip',
  '.rar',
].join(',')

const createAttachmentId = (prefix = 'attachment') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const encodeSvgDataUrl = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`

const createIconSvg = (emoji, startColor, endColor) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="${startColor}" />
        <stop offset="100%" stop-color="${endColor}" />
      </linearGradient>
      <linearGradient id="gl" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.32)" />
        <stop offset="55%" stop-color="rgba(255,255,255,0.04)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.10)" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="152" height="152" rx="42" fill="url(#g)" />
    <rect x="4" y="4" width="152" height="152" rx="42" fill="url(#gl)" />
    <circle cx="118" cy="38" r="24" fill="rgba(255,255,255,0.16)" />
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="80">${emoji}</text>
  </svg>
`

export const CHAT_ICON_CATEGORIES = [
  { id: 'all', icon: '🎨', label: 'Tất cả' },
  { id: 'emotions', icon: '😊', label: 'Cảm xúc' },
  { id: 'gestures', icon: '👋', label: 'Cử chỉ' },
  { id: 'travel', icon: '✈️', label: 'Du lịch' },
  { id: 'fun', icon: '🎉', label: 'Vui vẻ' },
]

const ICON_DEFINITIONS = [
  { id: 'smile', emoji: '😊', label: 'Smile', category: 'emotions' },
  { id: 'love', emoji: '😍', label: 'Love', category: 'emotions' },
  { id: 'cool', emoji: '😎', label: 'Cool', category: 'emotions' },
  { id: 'laugh', emoji: '😂', label: 'Laugh', category: 'emotions' },
  { id: 'wow', emoji: '😮', label: 'Wow', category: 'emotions' },
  { id: 'cry', emoji: '😭', label: 'Cry', category: 'emotions' },
  { id: 'angry', emoji: '😡', label: 'Angry', category: 'emotions' },
  { id: 'sad', emoji: '😔', label: 'Sad', category: 'emotions' },
  { id: 'kiss', emoji: '😘', label: 'Kiss', category: 'emotions' },
  { id: 'wink', emoji: '😉', label: 'Wink', category: 'emotions' },
  { id: 'blush', emoji: '🥰', label: 'Blush', category: 'emotions' },
  { id: 'surprised', emoji: '😲', label: 'Surprised', category: 'emotions' },
  { id: 'excited', emoji: '🤩', label: 'Excited', category: 'emotions' },
  { id: 'thinking', emoji: '🤔', label: 'Thinking', category: 'emotions' },
  { id: 'sleepy', emoji: '😴', label: 'Sleepy', category: 'emotions' },
  { id: 'nervous', emoji: '😰', label: 'Nervous', category: 'emotions' },
  { id: 'thumbs-up', emoji: '👍', label: 'Like', category: 'gestures' },
  { id: 'thumbs-down', emoji: '👎', label: 'Dislike', category: 'gestures' },
  { id: 'clap', emoji: '👏', label: 'Clap', category: 'gestures' },
  { id: 'ok', emoji: '👌', label: 'OK', category: 'gestures' },
  { id: 'hello', emoji: '👋', label: 'Hello', category: 'gestures' },
  { id: 'pray', emoji: '🙏', label: 'Thanks', category: 'gestures' },
  { id: 'muscle', emoji: '💪', label: 'Strong', category: 'gestures' },
  { id: 'call-me', emoji: '🤙', label: 'Call me', category: 'gestures' },
  { id: 'hug', emoji: '🤗', label: 'Hug', category: 'gestures' },
  { id: 'shrug', emoji: '🤷', label: 'Shrug', category: 'gestures' },
  { id: 'facepalm', emoji: '🤦', label: 'Facepalm', category: 'gestures' },
  { id: 'raise-hand', emoji: '🙋', label: 'Raise hand', category: 'gestures' },
  { id: 'plane', emoji: '✈️', label: 'Plane', category: 'travel' },
  { id: 'luggage', emoji: '🧳', label: 'Luggage', category: 'travel' },
  { id: 'globe', emoji: '🌍', label: 'Globe', category: 'travel' },
  { id: 'camera', emoji: '📸', label: 'Camera', category: 'travel' },
  { id: 'compass', emoji: '🧭', label: 'Compass', category: 'travel' },
  { id: 'beach', emoji: '🏖️', label: 'Beach', category: 'travel' },
  { id: 'mountain', emoji: '🏔️', label: 'Mountain', category: 'travel' },
  { id: 'map', emoji: '🗺️', label: 'Map', category: 'travel' },
  { id: 'party', emoji: '🥳', label: 'Party', category: 'fun' },
  { id: 'celebrate', emoji: '🎉', label: 'Celebrate', category: 'fun' },
  { id: 'rocket', emoji: '🚀', label: 'Rocket', category: 'fun' },
  { id: 'fire', emoji: '🔥', label: 'Fire', category: 'fun' },
  { id: 'star', emoji: '⭐', label: 'Star', category: 'fun' },
  { id: 'heart', emoji: '❤️', label: 'Heart', category: 'fun' },
  { id: 'gift', emoji: '🎁', label: 'Gift', category: 'fun' },
  { id: 'crown', emoji: '👑', label: 'Crown', category: 'fun' },
  { id: 'trophy', emoji: '🏆', label: 'Trophy', category: 'fun' },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow', category: 'fun' },
  { id: 'coffee', emoji: '☕', label: 'Coffee', category: 'fun' },
  { id: 'diamond', emoji: '💎', label: 'Diamond', category: 'fun' },
]

const ICON_TONES = [
  ['#f59e0b', '#f97316'],
  ['#ec4899', '#f43f5e'],
  ['#3b82f6', '#14b8a6'],
  ['#8b5cf6', '#ec4899'],
  ['#06b6d4', '#3b82f6'],
  ['#22c55e', '#14b8a6'],
  ['#ef4444', '#f97316'],
  ['#a855f7', '#6366f1'],
  ['#0ea5e9', '#6366f1'],
  ['#10b981', '#06b6d4'],
  ['#f97316', '#eab308'],
  ['#6366f1', '#8b5cf6'],
]

export const CHAT_ICON_PRESETS = ICON_DEFINITIONS.map((item, index) => {
  const [startColor, endColor] = ICON_TONES[index % ICON_TONES.length]
  return {
    ...item,
    dataUrl: encodeSvgDataUrl(createIconSvg(item.emoji, startColor, endColor)),
  }
})

export const STICKER_CATEGORIES = CHAT_ICON_CATEGORIES
export const STICKER_PRESETS = CHAT_ICON_PRESETS

const ensureAttachmentCapacity = (existingCount, incomingCount) => {
  if (existingCount + incomingCount > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(`Chỉ được gửi tối đa ${MAX_ATTACHMENTS_PER_MESSAGE} tệp trong một tin nhắn.`)
  }
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Không đọc được tệp đính kèm.'))
    reader.readAsDataURL(file)
  })

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Không đọc được ảnh đính kèm.'))
    }

    image.src = objectUrl
  })

const optimizeImageFile = async (file) => {
  if (file.type === 'image/svg+xml') {
    const rawDataUrl = await readFileAsDataUrl(file)
    if (rawDataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
      throw new Error('Ảnh SVG quá lớn. Vui lòng chọn file nhỏ hơn.')
    }
    return rawDataUrl
  }

  const image = await loadImageFromFile(file)
  const longestSide = Math.max(image.width, image.height) || 1
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestSide)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.')
  }

  context.drawImage(image, 0, 0, width, height)

  const preferredType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  let output = canvas.toDataURL(preferredType, 0.88)
  let quality = 0.88

  while (output.length > MAX_ATTACHMENT_DATA_URL_LENGTH && quality > 0.52) {
    quality -= 0.08
    output = canvas.toDataURL('image/jpeg', quality)
  }

  if (output.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
    throw new Error('Ảnh quá lớn sau khi tối ưu. Vui lòng chọn ảnh nhỏ hơn.')
  }

  return output
}

const normalizeAttachmentName = (name, fallback) => {
  const normalized = String(name || '').trim()
  return normalized || fallback
}

const createImageAttachment = async (file) => {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error('Ảnh đính kèm phải nhỏ hơn 2MB.')
  }

  const dataUrl = await optimizeImageFile(file)

  return {
    id: createAttachmentId('image'),
    type: 'image',
    name: normalizeAttachmentName(file.name, 'image.jpg'),
    mime_type: file.type || 'image/jpeg',
    size: file.size,
    data_url: dataUrl,
  }
}

const createFileAttachment = async (file) => {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File đính kèm phải nhỏ hơn 3MB.')
  }

  const dataUrl = await readFileAsDataUrl(file)
  if (dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
    throw new Error('File đính kèm quá lớn. Vui lòng chọn file nhỏ hơn.')
  }

  return {
    id: createAttachmentId('file'),
    type: 'file',
    name: normalizeAttachmentName(file.name, 'file'),
    mime_type: file.type || 'application/octet-stream',
    size: file.size,
    data_url: dataUrl,
  }
}

export const createAttachmentsFromFiles = async (files, existingCount = 0) => {
  const fileList = Array.from(files || [])
  ensureAttachmentCapacity(existingCount, fileList.length)

  const attachments = []
  for (const file of fileList) {
    if (String(file.type || '').startsWith('image/')) {
      attachments.push(await createImageAttachment(file))
      continue
    }

    attachments.push(await createFileAttachment(file))
  }

  return attachments
}

export const createStickerAttachment = (sticker) => {
  if (!sticker?.dataUrl) {
    throw new Error('Icon không hợp lệ.')
  }

  return {
    id: createAttachmentId('sticker'),
    type: 'sticker',
    name: `${sticker.id || 'icon'}.svg`,
    mime_type: 'image/svg+xml',
    size: sticker.dataUrl.length,
    data_url: sticker.dataUrl,
    sticker_id: sticker.id || null,
    label: sticker.label || '',
  }
}

export const formatAttachmentSize = (value) => {
  const size = Number(value) || 0
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`
  }
  return `${size} B`
}

export const getMessageAttachments = (message) => {
  const attachments = message?.meta?.attachments
  return Array.isArray(attachments) ? attachments : []
}

export const isVisualAttachment = (attachment) => {
  const type = String(attachment?.type || '')
  return type === 'image' || type === 'sticker' || type === 'icon'
}
