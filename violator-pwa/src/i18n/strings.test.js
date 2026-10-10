// Run with: npm test
// Every English line on the guest screens needs a Filipino one (and the
// other way round), with the same {placeholders}, and every FAQ answer
// needs its Filipino version.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FAQ_CATEGORIES, FAQ_ENTRIES } from '../data/faq.js'
import { FAQ_CATEGORY_LABELS_FIL, FAQ_ENTRIES_FIL } from '../data/faq.fil.js'
import { translate } from './language-context.js'
import { STRINGS } from './strings.js'

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('guest screen text', () => {
  it('has the same lines in English and Filipino', () => {
    const en = Object.keys(STRINGS.en).sort()
    const fil = Object.keys(STRINGS.fil).sort()
    assert.deepEqual(en.filter((k) => !fil.includes(k)), [], 'missing in Filipino')
    assert.deepEqual(fil.filter((k) => !en.includes(k)), [], 'only in Filipino')
  })

  it('keeps the same {placeholders} in both languages', () => {
    for (const key of Object.keys(STRINGS.en)) {
      assert.deepEqual(placeholders(STRINGS.fil[key]), placeholders(STRINGS.en[key]), key)
    }
  })

  it('fills placeholders and falls back to English', () => {
    assert.equal(translate('fil', 'step.of', { step: 1, total: 3 }), 'Hakbang 1 sa 3')
    assert.equal(translate('en', 'step.of', { step: 2, total: 3 }), 'Step 2 of 3')
    assert.equal(translate('xx', 'pay.title'), 'Pay Now')
    assert.equal(translate('fil', 'no.such.key'), 'no.such.key')
  })
})

describe('FAQs in Filipino', () => {
  it('has every question and topic', () => {
    for (const entry of FAQ_ENTRIES) {
      const fil = FAQ_ENTRIES_FIL[entry.id]
      assert.ok(fil?.question && fil?.answer, `missing ${entry.id}`)
      if (entry.link) assert.ok(fil.linkLabel, `missing link label for ${entry.id}`)
      // Bold marks come in pairs, or the answer renders half in bold.
      assert.equal(fil.answer.split('**').length % 2, 1, `unpaired ** in ${entry.id}`)
    }
    for (const c of FAQ_CATEGORIES) assert.ok(FAQ_CATEGORY_LABELS_FIL[c.id], `missing topic ${c.id}`)
  })
})
