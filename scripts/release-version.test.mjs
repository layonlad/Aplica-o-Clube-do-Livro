import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPromotion, nextVersion } from './release-version.mjs'

test('incrementa a parte à direita da versão', () => {
  assert.equal(nextVersion('1.0'), '1.1')
  assert.equal(nextVersion('1.9'), '1.10')
  assert.throws(() => nextVersion('01.1'))
  assert.throws(() => nextVersion('1.0.1'))
})

test('confere a versão e o código em Staging antes da promoção', () => {
  const candidate = { version: '1.0', source: 'a' }
  const staged = { ...candidate, environment: 'staging' }
  const live = { ...candidate, environment: 'production' }
  assert.doesNotThrow(() => assertPromotion(candidate, staged, null))
  assert.doesNotThrow(() => assertPromotion(candidate, staged, live))
  assert.throws(() => assertPromotion(candidate, { ...staged, source: 'b' }, null), /mesmo código/)
  assert.throws(() => assertPromotion(candidate, { ...staged, environment: 'production' }, null), /Staging/)
  const next = { version: '1.1', source: 'new' }
  assert.doesNotThrow(() => assertPromotion(next, { ...next, environment: 'staging' }, live))
  assert.throws(() => assertPromotion({ ...next, version: '1.2' }, { ...next, version: '1.2', environment: 'staging' }, live), /1\.1/)
})
