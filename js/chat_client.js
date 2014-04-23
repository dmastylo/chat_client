var addMessage = function(s)
{
  $('#output').append("<div class='message'>" + s + "</div>");
}

$(document).ready(function()
{
  $messageTextBox = $('#inputMessage');
  var commands = ["BROADCAST", "ME IS"];
  var command = "";
  var messageSent = "";

  if (this.MozWebSocket)
  {
    WebSocket = MozWebSocket;
  }

  if (!window.WebSocket)
  {
    alert("NO! WebSocket is NOT available in this (sucky) browser.");
  }

  var url = 'ws://localhost:8787/chat';
  var web_socket = new WebSocket(url);

  web_socket.onopen = function()
  {
    addMessage("Please enter your username in the textbox below.");
    // web_socket.binaryType = 'arraybuffer';
    // var a = new Uint8Array([ 1,2,3,4,5,6,7,8 ]);
    // web_socket.send(a.buffer);
  }

  web_socket.onmessage = function(e)
  {
    var web_socket_message = e.data.toString();
    console.log(web_socket_message);
    console.log(messageSent);

    // Determine command
    for (var i = 0; i < commands.length; ++i)
    {
      if (messageSent.lastIndexOf(commands[i], 0) === 0)
      {
        command = commands[i];
      }
    }

    console.log(command);

    // Filter output according to command given
    if (command === "ME IS")
    {
      username = messageSent.split(" ")[2];
      var message = "Identified as " + username;
      $messageTextBox.data("messagetype", "BROADCAST");
    }
    else if (command === "BROADCAST")
    {
      var split = web_socket_message.split(" ");
      var sender = split[2];
      var message = sender + ": " + split.splice(3, split.length).join(" ");
    }
    else if (command === "WHO HERE")
    {
      var message = "Users online: " + web_socket_message;
    }

    addMessage(message);
  }

  web_socket.onclose = function(e)
  {
    addMessage('closed');
  }

  web_socket.onerror = function(e)
  {
    addMessage('error');
  }

  $('#sendButton').click(function()
  {
    messageSent = $messageTextBox.data("messagetype") + " " + $messageTextBox.val();
    console.log(messageSent);

    web_socket.send(messageSent);
    $('#inputMessage').val("");
  });
});
