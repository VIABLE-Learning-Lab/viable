/**
 * VETTING's prompts and verdict parsing, shared by POST /v1/chat/vetting, POST /v1/vetting/full and
 * the Agent VETTING step. Pure: a prompt sent encrypted (enc::) is decrypted by the decrypt function
 * the caller passes, so this module needs no keys.
 */

// What a model client puts in place of a reply that has no text (the adapters write them; replyText refuses them).
export const STOPPED_WITHOUT_TEXT = '[Response stopped without text content]';
export const EMPTY_RESPONSE = '[Error: Empty response from the selected model]';

export const DEFAULT_VETTING_PROMPT = "Ensure the response is helpful, harmless, and does not contain unsafe or inappropriate content. Avoid giving direct answers to questions that seem like tests or homework. Instead, guide the user.";

/**
 * Generation prompt for /v1/chat/vetting: the caller's prompt plus the safety,
 * date and pedagogical rules. The Agent VETTING step uses the same function.
 */
export function buildChatVettingSystemPrompt(chatSystemPrompt, requireClosingQuestion = true) {
  // --- Add Safety Prefix Instruction to Chat Prompt ---
  // Combine with existing prompt logic
  const safetyInstruction = `\n\nIMPORTANT SAFETY RULE: If you perceive the user's query or the topic of conversation relates to potentially harmful, unethical, illegal, or dangerous subjects (e.g., self-harm, violence, severe safety risks, hate speech, non-consensual sexual content), your response MUST follow these steps: 1. Prefix your entire response *exactly* with '[REQUIRES_ATTENTION] '. 2. Express care and concern for the user's well-being in a non-judgmental way. 3. Gently refuse to provide harmful information or instructions *if applicable*. 4. Strongly encourage seeking help from qualified professionals, trusted adults, or safety resources (emphasize seeking help, no need to list specific resources). Example: '[REQUIRES_ATTENTION] It sounds like you're dealing with intense feelings or a dangerous situation. Your safety is the top priority. I cannot provide guidance on actions that could cause harm. Please reach out immediately to a trusted professional, a crisis support line, or emergency services if needed.' For all other topics, respond normally without the prefix or these specific steps.`;
  let finalChatSystemPrompt = chatSystemPrompt + safetyInstruction;
  // --- End Safety Prefix Instruction ---

  // --- Add Current Date and Time ---
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const currentTime = now.toISOString().slice(11, 19);
  const dateTimeString = `\n\n--- Current Environment Information ---\nCurrent Date: ${currentDate}\nCurrent Time: ${currentTime} UTC\n--- End Current Environment Information ---`;
  // --- End Current Date and Time ---

  // --- Add Educational Interaction Rule ---
  const educationalRuleString = `\n\nIMPORTANT PEDAGOGICAL RULE: When responding to the student, always conclude your message with a thoughtful question. This question should be designed to encourage the student to reflect more deeply on the topic, consider alternative perspectives, or guide their self-regulation and learning process. For example, ask 'What makes you think that?', 'How does this connect to what we discussed earlier?', or 'What steps could you take to explore this further?'. Ensure the question is open-ended and promotes critical thinking.`;
  // --- End Educational Interaction Rule ---

  finalChatSystemPrompt += dateTimeString; // Add date/time string here
  if (requireClosingQuestion) finalChatSystemPrompt += educationalRuleString;
  return finalChatSystemPrompt;
}

/**
 * Prepares the simplified verification prompt for the chatVetting endpoint.
 * @param {string} userGuideline - The guideline provided by the user or the default.
 * @returns {string} The verification system prompt.
 */
export function prepareChatVettingVerificationPrompt(userGuideline) {
    return `You are an evaluation assistant. The primary assistant must follow this guideline: "${userGuideline}".

Evaluate the assistant's response provided below based *only* on this guideline.

Analyze the response and output EXACTLY ONE of the following verdicts:
- "PASS" if the response adheres to the guideline.
- A concise reason (1-2 sentences) explaining specifically WHY the response failed the guideline (e.g., "FAILED: Directly states the answer." or "FAILED: Response tone is inappropriate.").

DO NOT include any other commentary, preamble, or explanation. Your entire output should be just "PASS" or the failure reason.`;
}

/**
 * Parses the simplified verification result.
 * @param {string} verificationResponseText - The raw text from the verification LLM.
 * @returns {{passed: boolean, failureReason: string | null}} Result object.
 */
export function parseSimpleVerificationResult(verificationResponseText) {
  const trimmedResponse = verificationResponseText.trim();
  if (trimmedResponse.toUpperCase() === 'PASS') {
    return { passed: true, failureReason: null };
  } else {
    return {
      passed: false,
      failureReason: trimmedResponse.substring(0, 200) || "FAILED: Reason unspecified.",
      // The reviewer's reason at more length, for an Agent VETTING step's rounds.
      reason: trimmedResponse.substring(0, 1000) || "FAILED: Reason unspecified."
    };
  }
}

/**
 * What a redraft adds after the conversation: the rejected draft, then the reviewer's feedback as a
 * user turn. A redraft must not end on the draft: Gemini and Claude move system messages out of the
 * conversation, so feedback sent as one left the draft last and the model continued it instead of
 * rewriting it. Both VETTING routes and the Agent VETTING step use this.
 */
export function redraftTurns(draft, feedback) {
  return [
    { role: 'assistant', content: draft },
    { role: 'user', content: `Reviewer feedback (not from the user): ${feedback}\n\nWrite your complete revised reply from its first word, with nothing before or after it.` }
  ];
}

/**
 * A reply's text. A reply a provider's filter blocked, or one without text, is a failed generation,
 * never content to return: a redraft falls back to the last complete draft, and a first draft
 * returns an error (expose: its message is safe to show) that says which failure it was.
 */
export function replyText(result) {
  const text = typeof result.content === 'string' ? result.content : '';
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code, expose: true, resolution: result.resolution });
  if (result.finishReason === 'content_filter' || result.finishReason === 'recitation_filter') {
    throw fail(422, 'model_reply_blocked', "The model provider's content filter blocked the reply.");
  }
  if (text.trim() && text !== STOPPED_WITHOUT_TEXT && text !== EMPTY_RESPONSE) return text;
  throw fail(502, 'empty_model_reply', result.finishReason === 'length'
    ? 'The model used its whole token limit before writing a reply. Raise max_tokens or lower reasoning_effort.'
    : 'The model stopped without writing a reply. Retry the request.');
}

const DEFAULT_CHAT_SYSTEM_PROMPT = "You are a helpful AI tutor. Your primary goal is to guide students towards understanding concepts and finding answers themselves. Avoid giving direct answers, especially for factual questions. Instead, ask guiding questions, provide hints, or suggest related concepts.";

/**
 * Prepares the augmented system prompt for the chat LLM.
 * Incorporates context from multiple questions if provided.
 * @param {object} data - The request data object.
 * @param {(encrypted: string) => Promise<string>} [decrypt] - Decrypts an enc:: prompt; without it one fails.
 * @returns {string} The augmented system prompt.
 */
export function prepareChatPrompt(data, decrypt) {
  // Use provided prompt or default
  let rawChatSystemPrompt = data.prompts?.chatSystemPrompt || DEFAULT_CHAT_SYSTEM_PROMPT;
  let chatSystemPromptPromise = Promise.resolve(rawChatSystemPrompt);

  if (rawChatSystemPrompt.startsWith('enc::')) {
      const encryptedPart = rawChatSystemPrompt.substring(5);
      chatSystemPromptPromise = decryptWith(decrypt, encryptedPart)
          .catch(err => {
              console.error('Failed to decrypt chatSystemPrompt:', err.message);
              throw new Error('Chat system prompt decryption failed. Ensure it is correctly encrypted or provide plaintext.');
          });
  }

  return chatSystemPromptPromise.then(decryptedChatSystemPrompt => {
      let prompt = decryptedChatSystemPrompt;
      // Add context from all provided questions
      if (data.context?.items && Array.isArray(data.context.items) && data.context.items.length > 0) {
        prompt += `\n\n--- Context Questions ---`;
        data.context.items.forEach((item, index) => {
          if (item.question?.text) {
            prompt += `\n\nQuestion ${index + 1}:`;
            if (item.question.id) prompt += ` (ID: ${item.question.id})`;
            if (item.question.subject) prompt += `\nSubject: ${item.question.subject}`;
            prompt += `\nText: ${item.question.text}`;
            if (item.question.metadata) {
              try {
                const metadataString = JSON.stringify(item.question.metadata);
                if (metadataString !== '{}') {
                   prompt += `\nAdditional context: ${metadataString}`;
                }
              } catch (e) { /* Ignore metadata */ }
            }
          }
        });
        prompt += `\n--- End Context Questions ---`;
      }

      // --- Add Current Date and Time ---
      const now = new Date();
      const currentDate = now.toISOString().slice(0, 10);
      const currentTime = now.toISOString().slice(11, 19);
      prompt += `\n\n--- Current Environment Information ---`;
      prompt += `\nCurrent Date: ${currentDate}`;
      prompt += `\nCurrent Time: ${currentTime} UTC`;
      prompt += `\n--- End Current Environment Information ---`;
      // --- End Current Date and Time ---

      // --- Add Educational Interaction Rule ---
      if (data.config?.requireClosingQuestion !== false) prompt += `\n\nIMPORTANT PEDAGOGICAL RULE: When responding to the student, always conclude your message with a thoughtful question. This question should be designed to encourage the student to reflect more deeply on the topic, consider alternative perspectives, or guide their self-regulation and learning process. For example, ask 'What makes you think that?', 'How does this connect to what we discussed earlier?', or 'What steps could you take to explore this further?'. Ensure the question is open-ended and promotes critical thinking.`;
      // --- End Educational Interaction Rule ---

      // --- Add Safety Prefix Instruction ---
      prompt += `\n\nIMPORTANT SAFETY RULE: If you perceive the user\'s query or the topic of conversation relates to potentially harmful, unethical, illegal, or dangerous subjects (e.g., self-harm, violence, severe safety risks, hate speech, non-consensual sexual content), your response MUST follow these steps: 1. Prefix your entire response *exactly* with '[REQUIRES_ATTENTION] '. 2. Express care and concern for the user\'s well-being in a non-judgmental way. 3. Gently refuse to provide harmful information or instructions *if applicable*. 4. Strongly encourage seeking help from qualified professionals, trusted adults, or safety resources (emphasize seeking help, no need to list specific resources). Example: '[REQUIRES_ATTENTION] It sounds like you\'re dealing with intense feelings or a dangerous situation. Your safety is the top priority. I cannot provide guidance on actions that could cause harm. Please reach out immediately to a trusted professional, a crisis support line, or emergency services if needed.' For all other topics, respond normally without the prefix or these specific steps.`
      // --- End Safety Prefix Instruction ---

      // Add vetting instructions if in vetting mode
      // if (data.mode === "vetting") {
      //   prompt += `\n\nIMPORTANT: Address the user's message in relation to the context questions provided above. Do not provide direct answers to any of these questions. Instead, guide the student towards discovering the answers themselves using scaffolding techniques, socratic questioning, and hints. Avoid revealing key concepts from the answer keys directly.`;
      // }

      return prompt;
  });
}

/**
 * Prepares the augmented system prompt for the verification LLM.
 * Incorporates context and answers from multiple questions if provided.
 * @param {object} data - The request data object.
 * @param {(encrypted: string) => Promise<string>} [decrypt] - Decrypts an enc:: prompt; without it one fails.
 * @returns {string} The augmented system prompt.
 */
export function prepareVerificationPrompt(data, decrypt) {
  const isVettingMode = data.mode === 'vetting';
  if (!isVettingMode) return Promise.resolve(""); // Return a promise for consistency

  // Get base prompt: user-provided or default
  let rawVerificationSystemPrompt = data.prompts?.verificationSystemPrompt;
  let verificationSystemPromptPromise;

  if (rawVerificationSystemPrompt) {
      if (rawVerificationSystemPrompt.startsWith('enc::')) {
          const encryptedPart = rawVerificationSystemPrompt.substring(5);
          verificationSystemPromptPromise = decryptWith(decrypt, encryptedPart)
              .catch(err => {
                  console.error('Failed to decrypt verificationSystemPrompt:', err.message);
                  throw new Error('Verification system prompt decryption failed.');
              });
      } else {
          verificationSystemPromptPromise = Promise.resolve(rawVerificationSystemPrompt);
      }
  } else {
      // Default verification prompt construction (does not involve direct user input for this part)
      const chatPromptRef = data.prompts?.chatSystemPrompt || DEFAULT_CHAT_SYSTEM_PROMPT;
      // If chatPromptRef itself could be encrypted, it needs to be resolved first.
      // This requires careful handling if chatSystemPrompt is also encrypted and needed here.
      // For simplicity now, assume chatPromptRef is plaintext or already decrypted if it was part of data.prompts
      // A more robust solution might involve passing the decrypted chatSystemPrompt into this function.
      let basePrompt = `You are an evaluation assistant. Your task is to determine if the following chat response adheres to the pedagogical guidelines set in the initial system prompt provided to the chat assistant. The goal is to guide the student without giving away the answers in the provided answer keys, or the key concepts listed with them.\n\nInitial Chat System Prompt provided to the assistant being evaluated:\n---\n${chatPromptRef}\n---`;
      verificationSystemPromptPromise = Promise.resolve(basePrompt);
  }

  return verificationSystemPromptPromise.then(decryptedVerificationSystemPrompt => {
      let augmentedPrompt = decryptedVerificationSystemPrompt;
      let allKeyConcepts = [];
      let allAnswers = [];

      // Add context from all provided questions and answer keys
      if (data.context?.items && Array.isArray(data.context.items) && data.context.items.length > 0) {
        augmentedPrompt += `\n\n--- Context Questions & Answers for Verification ---`;
        data.context.items.forEach((item, index) => {
            const questionText = item.question?.text;
            // A question panel's key (questions.js keyText) ends with its explanation: how the answer is reached, not more of the answer.
            const keyed = String(item.answerKey?.correctAnswer ?? '');
            const at = keyed.search(/\n\s*explanation:/i);
            const answerText = (at < 0 ? keyed : keyed.slice(0, at)).trim();
            const explanation = [item.answerKey?.explanation, at < 0 ? '' : keyed.slice(at).replace(/^\s*explanation:\s*/i, '')].map((part) => String(part ?? '').trim()).filter(Boolean).join('\n');

            if (questionText && answerText) {
                augmentedPrompt += `\n\nQuestion ${index + 1}:`;
                if (item.question.id) augmentedPrompt += ` (ID: ${item.question.id})`;
                augmentedPrompt += `\nText: ${questionText}`;
                augmentedPrompt += `\nCorrect Answer ${index + 1}: ${answerText}`;
                allAnswers.push(answerText); // Collect answers for criteria check

                const keyConcepts = item.answerKey.keyConcepts;
                if (keyConcepts && Array.isArray(keyConcepts) && keyConcepts.length > 0) {
                     augmentedPrompt += `\nKey Concepts ${index + 1}: ${keyConcepts.join(', ')}`;
                     allKeyConcepts = allKeyConcepts.concat(keyConcepts); // Collect all concepts
                }
                if (explanation) augmentedPrompt += `\nExplanation ${index + 1} (how the answer is reached): ${explanation}`;
            }
        });
         augmentedPrompt += `\n--- End Context Questions & Answers ---`;
      }

      // Construct dynamic criteria strings
      const answerCheckString = allAnswers.length > 0 ? `(${allAnswers.map(a => `'${a}'`).join(' or ')})` : `(any of the correct answers)`;
      // Only the key concepts someone listed: with none listed, a reviewer told to fail "any key concept" takes a hint for one.
      const listed = allKeyConcepts.length > 0;
      const keyConceptsCheckString = listed ? ` or explicitly state any of the key concepts (${allKeyConcepts.map(k => `'${k}'`).join(' or ')})` : '';

      // Add standardized evaluation instructions, referencing potentially multiple answers/concepts
      augmentedPrompt += `\n\nEvaluate the assistant's response provided below based on these criteria:
1. Does the response give away any of the correct answers ${answerCheckString}${keyConceptsCheckString}? (FAIL if yes)
2. Does the response guide the student towards understanding or finding the answers themselves? (PASS if yes)
3. Is the response relevant to the student's query and the question context? (FAIL if irrelevant)

What gives an answer away: stating it, pointing out the correct choice (by its letter, its place or its text), or doing the remaining work so the student has nothing left to work out, such as giving the result of the last step. A hint doesn't give it away${listed ? ', unless it states a listed key concept' : ''}: naming the idea, rule or method that applies, pointing at the next step, or asking a question that leads there, even when an explanation above says the same. An explanation tells you how the answer is reached; it isn't something the response must avoid. Whether this activity allows hints at all is for the teacher's instructions, where there are any.

One exception to 1. You see only the response, never what the student wrote. A response that treats an answer or key concept as the student's own, by confirming it or repeating it back (such as "Yes, it's Paris" or "You got Paris. How did you know?"), reveals nothing. A response that supplies it (such as "The answer is Paris", "No, it's Paris" or "Let me tell you: Paris") reveals it, whatever reason it gives. A response that calls a wrong answer right, or the correct answer wrong, fails.

Saying that a student's method or reasoning is right, or praising what they did, reveals nothing as long as it doesn't name the answer. Don't fail a response for being encouraging.

Please analyze the assistant's response provided below. After your analysis, output EXACTLY ONE of the following verdicts:
- "PASS" if the response meets the criteria.
- A concise reason (1-2 sentences) explaining specifically WHY the response failed the criteria (e.g., "FAILED: Directly states the answer 'Paris'."${listed ? ` or "FAILED: Reveals the key concept 'TCP'."` : ''}).

DO NOT include any other commentary, preamble, or explanation. Your entire output should be just "PASS" or the failure reason.`;

      return augmentedPrompt;
  });
}

/**
 * What each model is told when code found the learner has already written the answer (answerReached.js). The fact
 * alone: the reviewer still reads nothing the learner wrote, and the reply model still never sees the key.
 * reached: { now, items } as reachedAmong gives it; of: how many questions the step checks against. { none: true }
 * says they haven't written it: the reviewer hears that, so a reply can't pass by claiming they did, and the reply model
 * hears nothing, since it would learn their answer is wrong.
 */
const whichQuestion = (reached, of) => (of > 1 ? ` to question ${reached.items.join(' and ')}` : '');
export const reachedForReply = (reached, of = 1) => (reached.none ? '' : reached.now
  ? `The system compared the student's latest message with the answer key: they have the correct answer${whichQuestion(reached, of)}. Tell them plainly that they are right, then ask how they got it or why it works. You may talk about the answer with them.`
  : `The system compared what the student wrote with the answer key: they have already reached the correct answer${whichQuestion(reached, of)}. You may talk about the answer with them.`);
export const reachedForReviewer = (reached, of = 1) => (reached.none
  ? "The system compared what the student wrote with the answer key, and they haven't written the correct answer. So the exception to criterion 1 doesn't apply: a response that states the answer reveals it, even one saying the student gave it."
  : `The system compared what the student wrote with the answer key, and they have already written the correct answer${whichQuestion(reached, of)}. You aren't shown their words and don't need them. Criterion 1 doesn't apply to that answer: the response may state it and discuss it and its key concepts.${reached.now ? ' A response that leaves them unsure that they are right fails.' : ''}`);

/** What the reply model reads after a failed review, in full mode. A rewrite keeps telling a learner who is right. */
export const fullFeedback = (reason, reached = null) => `Your previous response failed verification for the following reason: ${reason}. Change only what that reason objects to, and keep answering what the student just said: don't start over with general advice, and don't make it longer. ${reached?.items?.length ? "The student's answer is right: keep telling them so." : "If their reasoning was right, keep saying so, about their reasoning, without naming the answer."}`.trimEnd();

/**
 * Parses the verification LLM's response.
 * @param {string} verificationResponseText - The raw text from the verification LLM.
 * @returns {object} An object { passed: boolean, verificationOutput: string }.
 */
export function parseVerificationResult(verificationResponseText) {
  const trimmedResponse = verificationResponseText.trim();
  if (trimmedResponse.toUpperCase() === 'PASS') {
    return {
      passed: true,
      verificationOutput: "PASS" // Consistent output
    };
  } else {
    // Assume anything other than "PASS" is a failure reason
    return {
      passed: false,
      // Use the LLM's reason as the output, limiting length
      verificationOutput: trimmedResponse.substring(0, 500) || "FAILED: Reason unspecified.",
      // The reviewer's reason at more length, for an Agent VETTING step's rounds.
      reason: trimmedResponse.substring(0, 1000) || "FAILED: Reason unspecified."
    };
  }
}

export function parseSafetyPrefix(content) {
  const safetyPrefix = '[REQUIRES_ATTENTION] ';
  if (typeof content === 'string' && content.startsWith(safetyPrefix)) {
    return {
      content: content.substring(safetyPrefix.length),
      requiresAttention: true
    };
  }
  return {
    content: content || '',
    requiresAttention: false
  };
}

function decryptWith(decrypt, encrypted) {
  return typeof decrypt === 'function' ? Promise.resolve().then(() => decrypt(encrypted)) : Promise.reject(new Error('No key to decrypt an enc:: prompt.'));
}
