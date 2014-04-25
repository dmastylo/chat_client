var add_message = function(display_area, output)
{
  display_area.append("<div class='message'>" + output + "</div>");
}

var add_user = function(output)
{
  $('#who-here-output').append("<div class='message'>" + output + "</div>");
}

$(document).ready(function()
{
  $message_text_box = $('#inputMessage');
  $refresh_button = $('#refreshButton');
  $send_button = $('#sendButton');
  $send_pm_button = $('#sendPMButton');
  $mainOutput = $('#mainOutput');
  var server_responses = ["OK", "BROADCAST FROM", "PRIVATE FROM"];
  var commands = ["ME IS", "BROADCAST", "WHO HERE"];
  var message_sent = "";
  var username = "";

  if (this.MozWebSocket)
  {
    WebSocket = MozWebSocket;
  }

  if (!window.WebSocket)
  {
    alert("WebSocket is NOT available in this (sucky) browser.");
  }

  var url = 'ws://localhost:8787/chat';
  var web_socket = new WebSocket(url);

  web_socket.onopen = function()
  {
    add_message($mainOutput, "Please enter your username in the textbox below.");
    // web_socket.binaryType = 'arraybuffer';
    // var a = new Uint8Array([ 1,2,3,4,5,6,7,8 ]);
    // web_socket.send(a.buffer);
  }

  web_socket.onmessage = function(e)
  {
    var server_response;
    var web_socket_message = e.data.toString();
    console.log(web_socket_message);
    console.log(message_sent);

    // Determine server_response
    for (var i = 0; i < server_responses.length; ++i)
    {
      if (web_socket_message.lastIndexOf(server_responses[i], 0) === 0)
      {
        server_response = server_responses[i];
      }
    }

    console.log(server_response);

    if (server_response === "OK")
    {
      username = message_sent.split(" ")[2];
      var message = "Identified as " + username;
      $message_text_box.data("messagetype", "BROADCAST");

      add_message($mainOutput, message);
    }
    else if (server_response === "BROADCAST FROM")
    {
      // Figure out the sender
      var split = web_socket_message.split(" ");
      var sender = split[2];

      var message = sender + ": " + split.splice(3, split.length).join(" ");

      add_message($mainOutput, message);
    }
    else if (server_response === "PRIVATE FROM")
    {
      // Figure out the sender
      var lines = web_socket_message.split("\n");
      var message = lines[1];
      var sender = lines[0].split(" ")[2];

      // TODO
      // First check if conversation already exists

      // Add a new tab for the private message
      $("<li><a href='#" + sender + "' tabindex='-1' data-toggle='tab'>" + sender + "</a></li>")
          .appendTo('#privateMessageTabs');

      // Add a new tab-pane for the private message
      var newPMTab = $($('.privateMessageTemplate').html())
          .attr('id', sender)
          .appendTo('.tab-content');

      newPMTab.find(".panel-title").html("PM with " + sender);
      add_message(newPMTab.find(".output"), message);
    }
    else
    {
      // Clear out users
      $('#who-here-output').html('');

      // Gather and fill in users
      var message =  web_socket_message;
      for (var i = 0; i < message.split(",").length; ++i)
      {
        add_user(message.split(",")[i]);
      }
    }
  }

  web_socket.onclose = function(e)
  {
    add_message($mainOutput, 'closed');
  }

  web_socket.onerror = function(e)
  {
    add_message($mainOutput, 'error');
  }

  $send_button.click(function()
  {
    message_sent = $message_text_box.data("messagetype") + " " + $message_text_box.val();
    console.log(message_sent);

    web_socket.send(message_sent);
    $('#inputMessage').val("");
  });

  $send_pm_button.click(function()
  {
    message_sent = $('#pmMessage').data("messagetype") + "\n" + $('#pmMessage').val();
    console.log(message_sent);

    web_socket.send(message_sent);
    $('#pmMessage').val("");
  });

  $refresh_button.click(function()
  {
    message_sent = $refresh_button.data("messagetype");
    console.log(message_sent);
    web_socket.send(message_sent);
  });
});
