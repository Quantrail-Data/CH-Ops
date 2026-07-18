const greetingResponses = [
  "--Hello! How can I help you with your database today?",
  "--Hi there! What database question can I help you with?",
  "--Hey! I'm ready to help you explore your database.",
  "--Welcome! Ask me anything about your database.",
  "--Hi! What would you like to query today?",
  "--Hello! I'm here to help generate ClickHouse SQL.",
  "--Hey! How can I assist with your database?",
  "--Welcome back! What would you like to know about your data?",
  "--Hi! Ask me about your tables, columns, or SQL queries.",
  "--Hello! Ready when you are. What's your database question?",
  "--Hey there! Let's explore your database together.",
  "--Hi! What insights are you looking for today?",
  "--Hello! I'm here to help with your ClickHouse database.",
  "--Welcome! Feel free to ask about your schema or data.",
  "--Hi! What can I help you find in your database?",
];

const outofDomainResponses = [
  "--I specialize in answering questions about the provided database and generating ClickHouse SQL.",
  "--I'd be happy to help if your question is related to the connected database.",
  "--I can help with your database schema, tables, columns, and SQL generation.",
  "--That topic is outside my scope. Feel free to ask about your database instead.",
  "--I'm designed specifically for database exploration and ClickHouse SQL generation.",
  "--I can only answer questions related to the connected database.",
  "--I'd be happy to help if your question is about the provided database.",
  "--My expertise is limited to database analysis and SQL generation.",
  "--Please ask me something about your database, and I'll be glad to help.",
  "--I can't assist with unrelated topics, but I can help explore your database.",
  "--I'm here to answer database questions and generate ClickHouse SQL.",
  "--Ask me about your tables, columns, relationships, or data.",
  "--I'm built for ClickHouse SQL generation and database exploration.",
  "--I can help you analyze the connected database, but not unrelated subjects.",
  "--Try asking about your database structure, data, or SQL queries.",
];

export function isMessageFinders (response) {
    if (!response) return false;

    const com = [...greetingResponses,...outofDomainResponses]?.find(_v => _v === response);
    
    return com ? true : false;
}