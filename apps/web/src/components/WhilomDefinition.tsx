/**
 * The name, explained.
 *
 * Presented as a dictionary entry because that is what it is, and because the
 * shape carries the brand better than a paragraph would. Deliberately not a
 * dictionary *article*: no etymological chain, no citation numbers, no
 * competing senses. One pronunciation, three glosses, two sentences of what the
 * product does with the idea.
 */
export function WhilomDefinition() {
  return (
    <section className="definition" aria-labelledby="whilom-definition-heading">
      <h2 id="whilom-definition-heading" className="definition-word">
        whilom
      </h2>
      <p className="definition-pronunciation" lang="en-GB">
        /ˈwʌɪləm/
      </p>
      <p className="definition-glosses">once · formerly · in times past</p>
      <p className="definition-body">
        An old word for another time. Whilom helps you discover what stood here, who lived here and
        what happened here — from prehistory to the present day.
      </p>
      <p className="definition-origin">
        From Old English <i lang="ang">hwīlum</i> — later used for “formerly” or “once”.
      </p>
    </section>
  );
}
