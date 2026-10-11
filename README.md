# English Writing Assistant

An AI-powered English writing practice tool for checking, improving, and evaluating English writing. The project uses a Node.js/Express backend and an OpenAI-compatible SDK to call the DeepSeek API.

## Features

- **Grammar, spelling, and usage checking** — identifies errors and suggests corrections with explanations in Chinese. Usage checking also looks for unnatural wording, collocations, and expressions that may be grammatically correct but sound less natural.
- **Writing improvement** — rewrites English text to make it clearer and more natural while preserving the original meaning.
- **TOEFL Academic Discussion practice** — generates prompts, evaluates essays against the built-in rubric, and provides a model rewrite and targeted suggestions.
- **Gaokao English writing practice** — generates exam-style prompts and provides feedback based on Gaokao writing criteria.
- **Writing history and settings** — stores practice records locally and lets you configure where the history file is saved.
- **Learning-focused interface** — an English interface for immersion, with Chinese explanations and scoring suggestions to make feedback easier to understand.
- **Word count** — displays the writing length while you work.

> AI feedback is intended for practice and reference. Scores and corrections are not official exam results and may occasionally be inaccurate.

## Tech Stack

- Node.js
- Express
- OpenAI Node.js SDK
- DeepSeek API
- HTML/CSS/JavaScript frontend served by Express

## Requirements

- A recent version of [Node.js](https://nodejs.org/) with npm
- A DeepSeek API key, or an API key from another OpenAI-compatible provider after you update the API configuration
- Git, if you plan to clone the repository

## Run Locally

### 1. Get the project

Clone your repository and enter the project directory:

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_PROJECT_DIRECTORY>
```

You can also download the repository as a ZIP file and extract it.

### 2. Install dependencies

If the project already includes `package.json`, run:

```bash
npm install
```

If there is no `package.json` yet, initialize npm and install the backend dependencies:

```bash
npm init -y
npm install express openai dotenv
```

Check if node.js is installed

### 3. Configure your API key

By default, the backend is configured to use DeepSeek. Create a file named `.env` in the same directory as `server.js` and add your own API key:

```dotenv
Englishlearningapikey=YOUR_DEEPSEEK_API_KEY
```

Replace `YOUR_DEEPSEEK_API_KEY` with your actual key. Create a key through the [DeepSeek Platform](https://platform.deepseek.com/) and consult the [official API documentation](https://api-docs.deepseek.com/).

**Important:** The environment-variable name is case-sensitive and must match `Englishlearningapikey` exactly, because `server.js` reads `process.env.Englishlearningapikey`.

### 4. Start the server

From the project root, run:

```bash
node server.js
```

If your `package.json` defines a start script, you can alternatively use `npm start`.

When the terminal reports that the server has started, open:

**http://localhost:3000**

Keep the terminal window running while you use the application. Press `Ctrl+C` in that window to stop the local server.

## Use Your Own API or Model

### Use your own DeepSeek key

For a standard local setup, you only need to put your own key in `.env`. Do not put the key in frontend JavaScript, HTML, or any file that is served to the browser.

### Use another OpenAI-compatible provider

The current backend configuration in `server.js` looks like this:

```js
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.Englishlearningapikey,
});
```

To use another provider:

1. Change `baseURL` to the API endpoint specified by that provider.
2. Put that provider's API key in `.env` while keeping the environment-variable name `Englishlearningapikey`, unless you also change the code.
3. Search `server.js` for each `model:` value and replace it with model IDs supported by your provider.
4. Restart the server and test the relevant features.

This project uses more than one model name in its backend. Model names and supported parameters vary by provider, so changing the API key alone may not be enough. See the provider's documentation for its current endpoint, model IDs, and JSON-output support. The DeepSeek endpoint and model identifiers may also change over time; check the [official docs](https://api-docs.deepseek.com/) if an API request returns a model-related error.

## Local Data and Privacy

- On startup, the backend creates a `data/` directory if needed.
- The default settings file is `data/config.json` and the default history file is `data/history.json`.
- The application keeps up to 100 history records in the default local history file; older records are removed when the limit is exceeded.
- Your API requests are sent to the AI provider configured in `server.js`. Review that provider's privacy and data-handling policies before submitting sensitive writing.

To avoid sharing local credentials or personal history with Git, consider adding these entries to `.gitignore`:

```gitignore
.env
node_modules/
data/
```

Do not commit your real API key. If it has accidentally been published, revoke it with the provider and create a new one.

## Backend API Routes

The following routes are implemented in the current backend:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/check-grammar` | Check grammar, spelling, and usage |
| `POST` | `/api/optimize` | Improve an English text |
| `POST` | `/api/toefl/generate-topic` | Generate a TOEFL Academic Discussion prompt |
| `POST` | `/api/toefl/score` | Score a TOEFL essay and return feedback |
| `POST` | `/api/toefl/rewrite` | Rewrite a TOEFL essay as a model answer |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/history` | Read, save, update, and delete history records |
| `GET` | `/api/settings` | Read local settings |
| `GET` | `/api/settings/default` | Get the default history-file path |
| `POST` | `/api/settings` | Update the history-file path |

For example, you can test the writing checker after starting the server:

```bash
curl -X POST http://localhost:3000/api/check-grammar \
  -H "Content-Type: application/json" \
  -d '{"text":"He go to school yesterday."}'
```

## Troubleshooting

**The server says the API key is missing or the request returns an authentication error**

- Confirm that `.env` is in the same directory as `server.js`.
- Confirm that the variable is spelled exactly `Englishlearningapikey` and that the key is valid.
- Restart the server after changing `.env`.

**The API reports an unknown or unavailable model**

- Check the model names used in `server.js` against the provider's current model list.
- Confirm that the selected model supports the request parameters used by the application, including JSON output where required.

**The browser cannot open `localhost:3000`**

- Check that the server is still running and that the terminal did not report an error.
- Port `3000` may already be in use. If you change the port in `server.js`, use the same port in your browser.

**A feature returns an error or does not produce a result**

- Check the terminal for the backend error message.
- Verify your API balance/quota, model access, network connection, and provider status.

## Contributing

Bug reports, issue reports, and improvements are welcome. When reporting an issue, include the steps to reproduce it and any relevant error message, but never include API keys or other secrets.
