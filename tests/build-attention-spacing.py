from pathlib import Path
root = Path(__file__).resolve().parent.parent
source = (root / 'sprint-helper.js').read_text()
compactor = source[source.index('function s4tCompactAttentionLists('):source.index('function s4tIsCommonCard(card)')]
fixture = (root / 'tests/attention-spacing.html').read_text()
fixture = fixture.replace('__CSS__', (root / 'sprint-helper.css').read_text()).replace('__COMPACTOR__', compactor)
Path('/tmp/s4t-attention-spacing.html').write_text(fixture)
