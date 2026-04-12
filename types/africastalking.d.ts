declare module 'africastalking' {
  interface SMSResponse {
    SMSMessageData: {
      Message: string
      Recipients: Array<{ statusCode: number; number: string; cost: string; status: string; messageId: string }>
    }
  }

  interface SMS {
    send(options: { to: string[]; message: string; from?: string }): Promise<SMSResponse>
  }

  interface AfricasTalkingInstance {
    SMS: SMS
  }

  function AfricasTalking(options: { apiKey: string; username: string }): AfricasTalkingInstance
  export = AfricasTalking
}
