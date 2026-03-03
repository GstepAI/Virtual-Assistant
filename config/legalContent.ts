/**
 * Legal Content Configuration
 * Multi-language legal text for GDPR compliance
 * Version: 1.0.0
 */

import type { Language } from '../types';

export interface ConsentCategoryContent {
  title: string;
  description: string;
}

export interface AiTransparencyCategoryContent extends ConsentCategoryContent {
  disclosure: string;  // Full disclosure text for EU AI Act Article 50
}

export interface LegalContent {
  consent: {
    bannerTitle: string;
    bannerText: string;
    acceptAll: string;
    managePreferences: string;
    rejectNonEssential: string;
    modalTitle: string;
    modalDescription: string;
    savePreferences: string;
    categories: {
      essential: ConsentCategoryContent;
      interactionProcessing: ConsentCategoryContent;
      aiTransparency: ConsentCategoryContent;
      sessionAnalytics: ConsentCategoryContent;
      conversationData: ConsentCategoryContent;
      bugReportData: ConsentCategoryContent;
    };
    required: string;
    privacyPolicyLink: string;
  };
  privacyPolicy: {
    title: string;
    lastUpdated: string;
    closeButton: string;
    sections: {
      introduction: { title: string; content: string };
      dataController: { title: string; content: string };
      dataCollected: {
        title: string;
        content: string;
        tableHeaders: { dataType: string; purpose: string; legalBasis: string };
      };
      purposes: { title: string; content: string; list: string[] };
      thirdParties: {
        title: string;
        content: string;
        providers: { name: string; purpose: string; location: string }[];
      };
      dataRetention: { title: string; content: string };
      yourRights: { title: string; content: string; rights: string[] };
      exerciseRights: { title: string; content: string };
      cookies: { title: string; content: string };
      changes: { title: string; content: string };
      contact: { title: string; content: string };
    };
  };
}

const legalContent: Record<Language, LegalContent> = {
  'en-US': {
    consent: {
      bannerTitle: 'Your privacy, your choice',
      bannerText: 'We use a few cookies to keep things running smoothly and to understand how we can improve. You decide what you\'re comfortable with.',
      acceptAll: 'Accept All',
      managePreferences: 'Customise preferences',
      rejectNonEssential: 'Essential Only',
      modalTitle: 'Privacy Preferences',
      modalDescription: 'Your privacy matters to us. Choose what you\'re comfortable sharing — you can always change your mind later.',
      savePreferences: 'Save My Choices',
      categories: {
        essential: {
          title: 'Essential',
          description: 'Keeps the session running — your name, email, and room ID so we know who you are. Without this, nothing works.',
        },
        interactionProcessing: {
          title: 'Voice & Text Processing',
          description: 'Needed so the AI can hear and respond to you. Everything is encrypted and processed securely inside the EU — we never use your voice to train AI models.',
        },
        aiTransparency: {
          title: 'AI Disclosure',
          description: 'You\'re talking to BlueCrow\'s AI agent, not a human. It uses Azure AI to generate responses from our knowledge base. This acknowledgement is required by EU law.',
        },
        sessionAnalytics: {
          title: 'Session Analytics',
          description: 'Helps us understand how long sessions run and when things go wrong, so we can make the experience smoother for everyone.',
        },
        conversationData: {
          title: 'Conversation Storage',
          description: 'Saves your Q&A so you can get a session summary afterwards and so we can improve future answers.',
        },
        bugReportData: {
          title: 'Bug Reports',
          description: 'When something breaks and you report it, this lets us collect the technical details needed to actually fix it.',
        },
      },
      required: 'Required',
      privacyPolicyLink: 'Read our full Privacy Policy',
    },
    privacyPolicy: {
      title: 'Privacy Policy',
      lastUpdated: 'Last updated',
      closeButton: 'Close',
      sections: {
        introduction: {
          title: 'Introduction',
          content: 'Blue Crow Capital ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Virtual Financial Information Specialist service.',
        },
        dataController: {
          title: 'Data Controller',
          content: 'Blue Crow Capital is the data controller responsible for your personal data. For privacy inquiries, please contact us at privacy@bluecrowcapital.com.',
        },
        dataCollected: {
          title: 'Data We Collect',
          content: 'We collect the following categories of personal data:',
          tableHeaders: {
            dataType: 'Data Type',
            purpose: 'Purpose',
            legalBasis: 'Legal Basis',
          },
        },
        purposes: {
          title: 'How We Use Your Data',
          content: 'We use your personal data for the following purposes:',
          list: [
            'To provide and operate our Virtual Financial Information Specialist service',
            'To process your voice and text inputs through secure EU-based AI services',
            'To personalize your experience based on your preferences',
            'To improve our AI responses and knowledge base',
            'To diagnose and fix technical issues',
            'To comply with legal obligations',
          ],
        },
        thirdParties: {
          title: 'Third-Party Service Providers',
          content: 'We share your data with the following service providers who process data on our behalf. All AI processing occurs within the EU:',
          providers: [
            {
              name: 'Microsoft Azure (Sweden/Ireland)',
              purpose: 'AI services, speech processing, and knowledge base - EU data residency',
              location: 'EU (Sweden, Ireland)',
            },
            {
              name: 'Vercel',
              purpose: 'Application hosting',
              location: 'EU/US',
            },
          ],
        },
        dataRetention: {
          title: 'Data Retention',
          content: 'We retain your personal data for as long as necessary to fulfill the purposes outlined in this policy. Session data is typically retained for 12 months. Voice data is processed in real-time and not permanently stored. You may request deletion of your data at any time.',
        },
        yourRights: {
          title: 'Your Rights',
          content: 'Under the GDPR, you have the following rights regarding your personal data:',
          rights: [
            'Right of access - You can request a copy of your personal data',
            'Right to rectification - You can request correction of inaccurate data',
            'Right to erasure - You can request deletion of your data',
            'Right to restrict processing - You can limit how we use your data',
            'Right to data portability - You can receive your data in a portable format',
            'Right to object - You can object to certain processing activities',
            'Right to withdraw consent - You can withdraw consent at any time',
            'Right to lodge a complaint with a supervisory authority',
          ],
        },
        exerciseRights: {
          title: 'How to Exercise Your Rights',
          content: 'To exercise any of your rights, please contact us at privacy@bluecrowcapital.com. We will respond to your request within one month as required by GDPR.',
        },
        cookies: {
          title: 'Cookies and Local Storage',
          content: 'We use browser local storage to save your consent preferences and session state. We do not use tracking cookies. You can clear this data through your browser settings.',
        },
        changes: {
          title: 'Changes to This Policy',
          content: 'We may update this Privacy Policy from time to time. We will notify you of significant changes by requesting renewed consent when you next use our service.',
        },
        contact: {
          title: 'Contact Us',
          content: 'If you have questions about this Privacy Policy or our data practices, please contact us at:\n\nBlue Crow Capital\nEmail: privacy@bluecrowcapital.com',
        },
      },
    },
  },
  'en-UK': {
    consent: {
      bannerTitle: 'Your privacy, your choice',
      bannerText: 'We use a few cookies to keep things running smoothly and to understand how we can improve. You decide what you\'re comfortable with.',
      acceptAll: 'Accept All',
      managePreferences: 'Customise preferences',
      rejectNonEssential: 'Essential Only',
      modalTitle: 'Privacy Preferences',
      modalDescription: 'Your privacy matters to us. Choose what you\'re comfortable sharing — you can always change your mind later.',
      savePreferences: 'Save My Choices',
      categories: {
        essential: {
          title: 'Essential',
          description: 'Keeps the session running — your name, email, and room ID so we know who you are. Without this, nothing works.',
        },
        interactionProcessing: {
          title: 'Voice & Text Processing',
          description: 'Needed so the AI can hear and respond to you. Everything is encrypted and processed securely inside the EU — we never use your voice to train AI models.',
        },
        aiTransparency: {
          title: 'AI Disclosure',
          description: 'You\'re talking to BlueCrow\'s AI agent, not a human. It uses Azure AI to generate responses from our knowledge base. This acknowledgement is required by EU law.',
        },
        sessionAnalytics: {
          title: 'Session Analytics',
          description: 'Helps us understand how long sessions run and when things go wrong, so we can make the experience smoother for everyone.',
        },
        conversationData: {
          title: 'Conversation Storage',
          description: 'Saves your Q&A so you can get a session summary afterwards and so we can improve future answers.',
        },
        bugReportData: {
          title: 'Bug Reports',
          description: 'When something breaks and you report it, this lets us collect the technical details needed to actually fix it.',
        },
      },
      required: 'Required',
      privacyPolicyLink: 'Read our full Privacy Policy',
    },
    privacyPolicy: {
      title: 'Privacy Policy',
      lastUpdated: 'Last updated',
      closeButton: 'Close',
      sections: {
        introduction: {
          title: 'Introduction',
          content: 'Blue Crow Capital ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Virtual Financial Information Specialist service.',
        },
        dataController: {
          title: 'Data Controller',
          content: 'Blue Crow Capital is the data controller responsible for your personal data. For privacy enquiries, please contact us at privacy@bluecrowcapital.com.',
        },
        dataCollected: {
          title: 'Data We Collect',
          content: 'We collect the following categories of personal data:',
          tableHeaders: {
            dataType: 'Data Type',
            purpose: 'Purpose',
            legalBasis: 'Legal Basis',
          },
        },
        purposes: {
          title: 'How We Use Your Data',
          content: 'We use your personal data for the following purposes:',
          list: [
            'To provide and operate our Virtual Financial Information Specialist service',
            'To process your voice and text inputs through secure EU-based AI services',
            'To personalise your experience based on your preferences',
            'To improve our AI responses and knowledge base',
            'To diagnose and fix technical issues',
            'To comply with legal obligations',
          ],
        },
        thirdParties: {
          title: 'Third-Party Service Providers',
          content: 'We share your data with the following service providers who process data on our behalf. All AI processing occurs within the EU:',
          providers: [
            {
              name: 'Microsoft Azure (Sweden/Ireland)',
              purpose: 'AI services, speech processing, and knowledge base - EU data residency',
              location: 'EU (Sweden, Ireland)',
            },
            {
              name: 'Vercel',
              purpose: 'Application hosting',
              location: 'EU/US',
            },
          ],
        },
        dataRetention: {
          title: 'Data Retention',
          content: 'We retain your personal data for as long as necessary to fulfil the purposes outlined in this policy. Session data is typically retained for 12 months. Voice data is processed in real-time and not permanently stored. You may request deletion of your data at any time.',
        },
        yourRights: {
          title: 'Your Rights',
          content: 'Under the GDPR and UK GDPR, you have the following rights regarding your personal data:',
          rights: [
            'Right of access - You can request a copy of your personal data',
            'Right to rectification - You can request correction of inaccurate data',
            'Right to erasure - You can request deletion of your data',
            'Right to restrict processing - You can limit how we use your data',
            'Right to data portability - You can receive your data in a portable format',
            'Right to object - You can object to certain processing activities',
            'Right to withdraw consent - You can withdraw consent at any time',
            'Right to lodge a complaint with the ICO or relevant supervisory authority',
          ],
        },
        exerciseRights: {
          title: 'How to Exercise Your Rights',
          content: 'To exercise any of your rights, please contact us at privacy@bluecrowcapital.com. We will respond to your request within one month as required by GDPR.',
        },
        cookies: {
          title: 'Cookies and Local Storage',
          content: 'We use browser local storage to save your consent preferences and session state. We do not use tracking cookies. You can clear this data through your browser settings.',
        },
        changes: {
          title: 'Changes to This Policy',
          content: 'We may update this Privacy Policy from time to time. We will notify you of significant changes by requesting renewed consent when you next use our service.',
        },
        contact: {
          title: 'Contact Us',
          content: 'If you have questions about this Privacy Policy or our data practices, please contact us at:\n\nBlue Crow Capital\nEmail: privacy@bluecrowcapital.com',
        },
      },
    },
  },
  'pt-BR': {
    consent: {
      bannerTitle: 'Sua privacidade, sua escolha',
      bannerText: 'Usamos alguns cookies para manter tudo funcionando bem e entender como podemos melhorar. Voce decide com o que se sente confortavel.',
      acceptAll: 'Aceitar Todos',
      managePreferences: 'Personalizar preferencias',
      rejectNonEssential: 'Apenas Essenciais',
      modalTitle: 'Preferencias de Privacidade',
      modalDescription: 'Sua privacidade e importante para nos. Escolha o que voce se sente confortavel em compartilhar — voce pode mudar de ideia a qualquer momento.',
      savePreferences: 'Salvar Minhas Escolhas',
      categories: {
        essential: {
          title: 'Essencial',
          description: 'Mantem a sessao funcionando — seu nome, email e ID da sala para identificar voce. Sem isso, nada funciona.',
        },
        interactionProcessing: {
          title: 'Processamento de Voz e Texto',
          description: 'Necessario para que a IA possa ouvir e responder. Tudo e criptografado e processado com seguranca dentro da UE — nunca usamos sua voz para treinar modelos de IA.',
        },
        aiTransparency: {
          title: 'Divulgacao de IA',
          description: 'Voce esta conversando com o agente de IA da BlueCrow, nao com um humano. Ele usa Azure AI para gerar respostas da nossa base de conhecimento. Este reconhecimento e exigido por lei europeia.',
        },
        sessionAnalytics: {
          title: 'Analitica de Sessao',
          description: 'Nos ajuda a entender quanto tempo as sessoes duram e quando algo da errado, para melhorar a experiencia de todos.',
        },
        conversationData: {
          title: 'Armazenamento de Conversas',
          description: 'Salva seu historico de perguntas para voce receber um resumo da sessao e nos ajudar a melhorar respostas futuras.',
        },
        bugReportData: {
          title: 'Relatorios de Erros',
          description: 'Quando algo falha e voce reporta, isso nos permite coletar os detalhes tecnicos necessarios para realmente corrigir o problema.',
        },
      },
      required: 'Obrigatorio',
      privacyPolicyLink: 'Leia nossa Politica de Privacidade completa',
    },
    privacyPolicy: {
      title: 'Politica de Privacidade',
      lastUpdated: 'Ultima atualizacao',
      closeButton: 'Fechar',
      sections: {
        introduction: {
          title: 'Introducao',
          content: 'A Blue Crow Capital ("nos", "nosso" ou "nossa") esta comprometida em proteger sua privacidade. Esta Politica de Privacidade explica como coletamos, usamos, divulgamos e protegemos suas informacoes quando voce usa nosso servico de Especialista Virtual em Informacoes Financeiras.',
        },
        dataController: {
          title: 'Controlador de Dados',
          content: 'A Blue Crow Capital e o controlador de dados responsavel pelos seus dados pessoais. Para questoes de privacidade, entre em contato conosco em privacy@bluecrowcapital.com.',
        },
        dataCollected: {
          title: 'Dados que Coletamos',
          content: 'Coletamos as seguintes categorias de dados pessoais:',
          tableHeaders: {
            dataType: 'Tipo de Dado',
            purpose: 'Finalidade',
            legalBasis: 'Base Legal',
          },
        },
        purposes: {
          title: 'Como Usamos Seus Dados',
          content: 'Usamos seus dados pessoais para os seguintes propositos:',
          list: [
            'Para fornecer e operar nosso servico de Especialista Virtual em Informacoes Financeiras',
            'Para processar suas entradas de voz e texto atraves de servicos de IA seguros baseados na UE',
            'Para personalizar sua experiencia com base em suas preferencias',
            'Para melhorar as respostas da nossa IA e base de conhecimento',
            'Para diagnosticar e corrigir problemas tecnicos',
            'Para cumprir obrigacoes legais',
          ],
        },
        thirdParties: {
          title: 'Provedores de Servicos Terceiros',
          content: 'Compartilhamos seus dados com os seguintes provedores de servicos que processam dados em nosso nome. Todo processamento de IA ocorre na UE:',
          providers: [
            {
              name: 'Microsoft Azure (Suecia/Irlanda)',
              purpose: 'Servicos de IA, processamento de fala e base de conhecimento - residencia de dados na UE',
              location: 'UE (Suecia, Irlanda)',
            },
            {
              name: 'Vercel',
              purpose: 'Hospedagem da aplicacao',
              location: 'UE/EUA',
            },
          ],
        },
        dataRetention: {
          title: 'Retencao de Dados',
          content: 'Retemos seus dados pessoais pelo tempo necessario para cumprir os propositos descritos nesta politica. Dados de sessao sao tipicamente retidos por 12 meses. Dados de voz sao processados em tempo real e nao sao armazenados permanentemente. Voce pode solicitar a exclusao dos seus dados a qualquer momento.',
        },
        yourRights: {
          title: 'Seus Direitos',
          content: 'Sob a LGPD e GDPR, voce tem os seguintes direitos em relacao aos seus dados pessoais:',
          rights: [
            'Direito de acesso - Voce pode solicitar uma copia dos seus dados pessoais',
            'Direito de retificacao - Voce pode solicitar a correcao de dados imprecisos',
            'Direito de exclusao - Voce pode solicitar a exclusao dos seus dados',
            'Direito de restringir processamento - Voce pode limitar como usamos seus dados',
            'Direito a portabilidade de dados - Voce pode receber seus dados em formato portatil',
            'Direito de objecao - Voce pode se opor a certas atividades de processamento',
            'Direito de retirar consentimento - Voce pode retirar o consentimento a qualquer momento',
            'Direito de registrar reclamacao junto a uma autoridade supervisora',
          ],
        },
        exerciseRights: {
          title: 'Como Exercer Seus Direitos',
          content: 'Para exercer qualquer um dos seus direitos, entre em contato conosco em privacy@bluecrowcapital.com. Responderemos a sua solicitacao dentro de um mes, conforme exigido pela LGPD/GDPR.',
        },
        cookies: {
          title: 'Cookies e Armazenamento Local',
          content: 'Usamos o armazenamento local do navegador para salvar suas preferencias de consentimento e estado da sessao. Nao usamos cookies de rastreamento. Voce pode limpar esses dados atraves das configuracoes do seu navegador.',
        },
        changes: {
          title: 'Alteracoes nesta Politica',
          content: 'Podemos atualizar esta Politica de Privacidade periodicamente. Notificaremos voce sobre alteracoes significativas solicitando novo consentimento quando voce usar nosso servico novamente.',
        },
        contact: {
          title: 'Fale Conosco',
          content: 'Se voce tiver duvidas sobre esta Politica de Privacidade ou nossas praticas de dados, entre em contato conosco em:\n\nBlue Crow Capital\nEmail: privacy@bluecrowcapital.com',
        },
      },
    },
  },
};

export const getLegalContent = (language: Language): LegalContent => {
  return legalContent[language] || legalContent['en-US'];
};

export default legalContent;
