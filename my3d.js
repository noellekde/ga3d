class MyExtension {
  getInfo() {
    return {
      id: 'myext',
      name: 'My Extension',
      color1: '#4C97FF',
      blocks: [
        {
          opcode: 'hello',
          blockType: Scratch.BlockType.REPORTER,
          text: 'hello [NAME]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'world' }
          }
        },
        {
          opcode: 'doThing',
          blockType: Scratch.BlockType.COMMAND,
          text: 'do thing [N] times',
          arguments: {
            N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 }
          }
        }
      ]
    };
  }

  hello(args) {
    return `Hello, ${args.NAME}!`;
  }

  doThing(args) {
    console.log('doing it', args.N);
  }
}

Scratch.extensions.register(new MyExtension());