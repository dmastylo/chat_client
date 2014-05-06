/* chat-server.c */


/** VERSION 3 for compatibility with Spring 2014 Project #4
 **
 **  IMPLEMENTED APPLICATION-LEVEL PROTOCOL:
 **
 **    ME IS <username>\n
 **    -- this returns "OK\n" or, if duplicate user, "ERROR\n"
 **
 **
 **    WHO HERE <from-user>\n
 **      --or--
 **    WHO HERE
 **    -- this returns "<user1>,<user2>,<user3>,...,<user-n>\n"
 **
 **
 **    SEND <from-user> <target-user>\n
 **      --or--
 **    SEND <target-user>\n
 **    -- upon receiving this message type, the server sends
 **       the following:
 **
 **         PRIVATE FROM <from-user>\n
 **         <message-content>
 **
 **
 **    BROADCAST <from-user>\n
 **      --or--
 **    BROADCAST\n
 **    -- upon receiving this message type, the server sends
 **       the following:
 **
 **         BROADCAST FROM <from-user>\n
 **         <message-content>
 **
 **
 **    LOGOUT <from-user>\n
 **      --or--
 **    LOGOUT\n
 **    -- this does not return anything to the client
 **
 **
 **  Notes:
 **
 **  (1) Because we're using TCP (and not supporting UDP), 
 **      we do not need to have the <from-user> field in
 **      the above commands; therefore, it is optional.
 **
 **  (2) For the above commands, note that single space
 **      characters are all that are supported for delimiters
 **      (as opposed to arbitrary amounts of whitespace).
 **
 **  (3) The extended payload features of the WebSocket
 **      protocol are not implemented, and some commands
 **      will silently fail if the maximum length of 126
 **      is exceeded.
 **
 **  (4) We have omitted the need for specifying length
 **      within the application-level protocol, because
 **      the WebSocket protocol handles this.
 **
 **/


/* COMPILE sha1-c by doing this:
 *
 *   bash$ cd sha1-c
 *   bash$ gcc -Wall -c sha1.c
 *
 *    (this creates the sha1.o file in the sha1-c directory)
 */

/* COMPILE base64.c by doing this:
 *
 *   bash$ gcc -Wall -c base64.c
 *
 *    (this creates the base64.o file)
 */

/* COMPILE USING:
 *
 *   bash$ gcc -Wall -o chat-server chat-server.c sha1-c/sha1.o base64.o -lm
 *
 */

#include <math.h>
#include <sys/errno.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <stdio.h>
#include <unistd.h>
#include <string.h>
#include <stdlib.h>
#include <arpa/inet.h>
#include <sys/select.h>
#include <stdint.h>

/* from http://www.packetizer.com/security/sha1/ */
#include "sha1-c/sha1.h"

#define GUID "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

#define WS_STATUS_CONNECTING 1
#define WS_STATUS_OPEN 2
#define WS_STATUS_CLOSING 3
#define WS_STATUS_CLOSED 4

/* change this to a '|' character for testing the SEND command */
char newline = '|';


extern int errno;

#define BUFFER_SIZE 4096
#define MAX_CLIENTS 100

int hex_to_digit( char h ) { return ( h > '9' ? h - 'A' + 10 : h - '0' ); }

void trim_right( char * s )
{
  while ( strlen( s ) > 0 && ( s[ strlen( s ) - 1 ] == newline || s[ strlen( s ) - 1 ] == ' ' ) )
  {
    s[ strlen( s ) - 1 ] = '\0';
  }
}

char * do_hash( char * sec_ws_key );
char * encode_base64( int size, unsigned char * src );

int process_cmd( int chatuser_index,
                 char * payload,
                 int payload_length,
                 char * response,
                 int * response_length );

struct chatuser
{
  int fd;
  int status;      /* ws status */
  char * username;
};

struct chatuser chatusers[ MAX_CLIENTS ];
int chatuser_next_index = 0;

int find_chatuser( char * username )
{
  int i;
  for ( i = 0 ; i < chatuser_next_index ; i++ )
  {
    if ( chatusers[i].username != NULL &&
         strcmp( username, chatusers[i].username ) == 0 )
    {
      return i;
    }
  }

  return -1;
}

int main()
{
  char buffer[ BUFFER_SIZE ];

  int sock, newsock, len, n;
  unsigned int fromlen;

  fd_set readfds;

#if 0
  int client_socket[ MAX_CLIENTS ]; /* client socket fd list */
  int client_socket_status[ MAX_CLIENTS ]; /* ws status */
  int client_socket_index = 0;  /* next free spot */
#endif

  /* socket structures from /usr/include/sys/socket.h */
  struct sockaddr_in server;
  struct sockaddr_in client;

  unsigned short port = 8787;

  /* Create the listener socket as TCP socket */
  /*   (use SOCK_DGRAM for UDP)               */
  sock = socket( PF_INET, SOCK_STREAM, 0 );

  if ( sock < 0 )
  {
    perror( "socket()" );
    exit( 1 );
  }

  server.sin_family = PF_INET;
  server.sin_addr.s_addr = INADDR_ANY;

  /* htons() is host-to-network-short for marshalling */
  /* Internet is "big endian"; Intel is "little endian" */
  server.sin_port = htons( port );
  len = sizeof( server );

  /* Enable using the port that is in TIME_WAIT state */
  int yes = 1;
  setsockopt( sock, SOL_SOCKET, SO_REUSEADDR, (const char *)&yes, sizeof( yes ) );

  if ( bind( sock, (struct sockaddr *)&server, len ) < 0 )
  {
    perror( "bind()" );
    exit( 1 );
  }

  fromlen = sizeof( client );
  listen( sock, 5 );  /* 5 is number of backlogged waiting clients */
  printf( "Listener socket created and bound to port %d\n", port );

  while ( 1 )
  {
    int q;

#if 0
    struct timeval timeout;
    timeout.tv_sec = 3;   /* every 3 seconds */
    timeout.tv_usec = 400;  /* plus 400 msec */
    /* set timeout value to 0 for a non-blocking quick "poll" */
#endif

    FD_ZERO( &readfds );
    FD_SET( sock, &readfds );  /* <== incoming new client connections */
    printf( "Set FD_SET to include listener fd %d\n", sock );

    for ( q = 0 ; q < chatuser_next_index ; q++ )
    {
      FD_SET( chatusers[ q ].fd, &readfds );
      printf( "Set FD_SET to include client socket fd %d\n",
              chatusers[ q ].fd );
    }

    /* BLOCK (but blocked on ALL fds that are set via FD_SET */
    q = select( FD_SETSIZE, &readfds, NULL, NULL, NULL );

#if 0
    /* non-blocking based on timeout struct */
    q = select( FD_SETSIZE, &readfds, NULL, NULL, &timeout );
    /* q is the number of ready file descriptors */

    /* q is 0 if timeout struct was set and a timeout occurred */
    if ( q == 0 )
    {
      printf( "timeout. do something else here....\n" );
    }
#endif

    if ( FD_ISSET( sock, &readfds ) )
    {
      /* We know that this accept() call will NOT block */
      newsock = accept( sock, (struct sockaddr *)&client, &fromlen );
      printf( "Accepted client connection\n" );
      chatusers[ chatuser_next_index ].fd = newsock;
      chatusers[ chatuser_next_index ].status = WS_STATUS_CONNECTING;
      chatusers[ chatuser_next_index ].username = NULL;
      chatuser_next_index++;
    }

    for ( q = 0 ; q < chatuser_next_index ; q++ )
    {
      int fd = chatusers[ q ].fd;

      if ( FD_ISSET( fd, &readfds ) )
      {
        int close_it = 0;
        int broadcast = 0;
        n = recv( fd, buffer, BUFFER_SIZE - 1, 0 );

        if ( n == 0 )
        {
          close_it = 1;
        }
        else if ( n < 0 )
        {
          perror( "recv()" );
          close_it = 1;
        }
        else if ( chatusers[ q ].status == WS_STATUS_CONNECTING )
        {
          buffer[n] = '\0';
          printf( "Received message from fd %d: [%s]\n", fd, buffer );

          char *tok = strtok( buffer, "\n" );
          char *path = NULL, *host = NULL, *location = NULL;
          char *sec_ws_key = NULL, *sec_ws_protocol = NULL;

          if ( tok != NULL )
          {
            printf( "REQUEST LINE: %s\n", tok );

            if ( strncmp( tok, "GET /", 5 ) != 0 )
            {
              printf( "Unknown request line. Ignoring request.\n" );
              close_it = 1;
              tok = NULL;
            }
            else
            {
              path = (char *)calloc( strlen( tok ), sizeof( char ) );
              int i = 0;
              char *p = tok + 4;
              while ( p < tok + strlen( tok ) && *p != ' ' )
              {
                path[i++] = *p++;
              }
              printf( "path is: [%s]\n", path );
            }

            if ( tok != NULL )
            {
              tok = strtok( NULL, "\n" );
            }
          }

          while ( tok != NULL )
          {
            printf( "HEADER LINE: %s\n", tok );

            if ( strncmp( tok, "Host: ", 6 ) == 0 )
            {
              host = (char *)calloc( strlen( tok ), sizeof( char ) );
              strcpy( host, tok + 6 );
              while ( host[ strlen( host ) - 1 ] == '\r' ||
                      host[ strlen( host ) - 1 ] == '\n' )
              {
                host[ strlen( host ) - 1 ] = '\0';
              }
              printf( "Host is: [%s]\n", host );

              location = (char *)calloc( strlen( host ) +
                                         strlen( path ) + 6,
                                         sizeof( char ) );
              sprintf( location, "ws://%s%s", host, path );
              printf( "Location is: [%s]\n", location );
            }
            else if ( strncmp( tok, "Sec-WebSocket-Key: ", 19 ) == 0 )
            {
              sec_ws_key = (char *)calloc( strlen( tok ), sizeof( char ) );
              strcpy( sec_ws_key, tok + 19 );
              while ( sec_ws_key[ strlen( sec_ws_key ) - 1 ] == '\r' ||
                      sec_ws_key[ strlen( sec_ws_key ) - 1 ] == '\n' )
              {
                sec_ws_key[ strlen( sec_ws_key ) - 1 ] = '\0';
              }
              printf( "Sec-WebSocket-Key is: [%s]\n", sec_ws_key );
            }
            else if ( strncmp( tok, "Sec-WebSocket-Protocol: ", 24 ) == 0 )
            {
              sec_ws_protocol = (char *)calloc( strlen( tok ), sizeof( char ) );
              strcpy( sec_ws_protocol, tok + 24 );
              while ( sec_ws_protocol[ strlen( sec_ws_protocol ) - 1 ] == '\r' ||
                      sec_ws_protocol[ strlen( sec_ws_protocol ) - 1 ] == '\n' )
              {
                sec_ws_protocol[ strlen( sec_ws_protocol ) - 1 ] = '\0';
              }
              printf( "Sec-WebSocket-Protocol is: [%s]\n", sec_ws_protocol );
            }

            tok = strtok( NULL, "\n" );
          }

          if ( host == NULL )
          {
            printf( "Missing Host header. Ignoring.\n" );
            close_it = 1;
          }
          else if ( sec_ws_key == NULL )
          {
            printf( "Missing Sec-WebSocket-Key header. Ignoring.\n" );
            close_it = 1;
          }

          if ( close_it == 0 )
          {
            char response[ BUFFER_SIZE ];
            char *hashed = NULL;
            char *r2 = "";

            hashed = do_hash( sec_ws_key );

            if ( sec_ws_protocol )
            {
              r2 = (char *)calloc( strlen( sec_ws_protocol ) + 32, sizeof( char ) );
              sprintf( r2, "Sec-WebSocket-Protocol: %s\r\n", sec_ws_protocol );
            }

            sprintf( response, "HTTP/1.1 101 Switching Protocols\r\n"
                               "Upgrade: WebSocket\r\n"
                               "Connection: Upgrade\r\n"
                               "Sec-WebSocket-Accept: %s\r\n%s\r\n",
                               hashed, r2 );

            printf( "RESPONSE: [%s]\n", response );

            n = send( fd, response, strlen( response ), 0 );
            if ( n < strlen( response ) )
            {
              perror( "send()" );
              close_it = 1;
            }
            else
            {
              chatusers[ q ].status = WS_STATUS_OPEN;
            }
          }
        }
        else if ( chatusers[ q ].status == WS_STATUS_OPEN )
        {
          char response[ BUFFER_SIZE ];
          int response_length = 0;

          printf( "Received ws message from fd %d of length %d\n", fd, n );

          if ( n < 6 )
          {
            printf( "Frame too short. Ignoring.\n" );
            close_it = 1;
          }
          else
          {
            int payload_start = 2;

            char b1 = buffer[0];
            int fin = b1 & 0x80;    /* 1st bit is FIN */
            int opcode = b1 & 0x0f; /* low-order 4 bits */

            response[0] = 0x80 | opcode;
            response_length++;

            char b2 = buffer[1];
            int mask = b2 & 0x80;   /* 1st bit is MASK */
            int length = b2 & 0x7f; /* low-order 7 bits */

            printf( "FIN: %d; OPCODE: %d; MASK: %d; LENGTH: %d\n",
                    fin, opcode, mask, length );

            if ( length == 126 || length == 127 )
            {
              printf( "Frame has length %d. Ignoring for now....\n", length );
              close_it = 1;
            }
            else
            {
              char mask_bytes[4];

              if ( mask )
              {
                memcpy( mask_bytes, buffer + payload_start, 4 );
                payload_start += 4;
              }

              if ( n < payload_start + length )
              {
                printf( "Frame is incomplete. Ignoring.\n" );
                close_it = 1;
              }
              else
              {
                char * payload = (char *)calloc( length + 1, sizeof( char ) );
                memcpy( payload, buffer + payload_start, length );

                if ( mask )
                {
                  int i;
                  for ( i = 0 ; i < length ; i++ )
                  {
                    payload[i] ^= mask_bytes[ i % 4 ];
                  }
                }

                if ( opcode == 0x08 )
                {
                  printf( "RCVD CLOSE FRAME\n" );
                  response[1] = 0x02;
                  response[2] = 0x00;  /* echo close back */
                  response[3] = 0x03;
                  response_length += 3;
                }
                else if ( opcode == 0x02 || opcode == 0x01 )
                {
                  printf( "RCVD %s DATA FRAME\n",
                          ( opcode == 0x01 ? "TEXT" : "BINARY" ) );

                  if ( opcode == 0x01 )
                  {
                    printf( "PAYLOAD: [%s]\n", payload );
                  }

                  int whattodo = process_cmd( q, payload, length, response, &response_length );

                  if ( whattodo == 1 )
                  {
                    close_it = 1;
                  }
                  else if ( whattodo == 2 )
                  {
                    broadcast = 1;
                  }
                  else if ( whattodo > 2 )
                  {
                    fd = whattodo;
                  }
                }
              }
            }
          }

          if ( close_it == 0 )
          {
            if ( broadcast == 0 )
            {
              printf( "SENDING TO fd %d\n", fd );
              printf( "SENDING: [%s]\n", response );

              n = send( fd, response, response_length, 0 );
              if ( n < response_length )
              {
                perror( "send()" );
              }
              else
              {
                printf( "successfully sent %d bytes\n", n );
              }
            }
            else
            {
              int i;
              for ( i = 0 ; i < chatuser_next_index ; i++ )
              {
                if ( chatusers[i].username != NULL )
                {
                  int fd = chatusers[i].fd;
                  printf( "SENDING (broadcast) TO fd %d\n", fd );
                  printf( "SENDING: [%s]\n", response );

                  n = send( fd, response, response_length, 0 );
                  if ( n < response_length )
                  {
                    perror( "send()" );
                  }
                  else
                  {
                    printf( "successfully sent %d bytes\n", n );
                  }
                }
              }
            }
          }
        }

        if ( close_it )
        {
          int k;
          printf( "Client on fd %d closed connection\n", fd );
          close( fd );

          /* remove fd from chatusers[] array: */
          for ( k = 0 ; k < chatuser_next_index ; k++ )
          {
            if ( fd == chatusers[ k ].fd )
            {
              /* found it -- copy remaining elements over fd */
              int m;
              for ( m = k ; m < chatuser_next_index - 1 ; m++ )
              {
                chatusers[ m ] = chatusers[ m + 1 ];
              }
              chatuser_next_index--;
              break;  /* all done */
            }
          }
        }
      }
    }
  }

  return 0; /* we never get here */
}



/* payload is "ME IS <username>\n" etc. */
/* response has first byte set (FIN and OPCODE) */
/* returns whether to do nothing (0), close connection (1),
   broadcast (2), or send a private message (>2) */
int process_cmd( int chatuser_index,
                 char * payload,
                 int payload_length,
                 char * response,
                 int * response_length )
{
  if ( strncmp( payload, "ME IS ", 6 ) == 0 )
  {
    trim_right( payload );

    if ( find_chatuser( payload + 6 ) == -1 )
    {
      chatusers[ chatuser_index ].username = (char *)calloc( payload_length - 4, sizeof( char ) );
      strcpy( chatusers[ chatuser_index ].username, payload + 6 );
      printf( "Identified user: [%s]\n", chatusers[ chatuser_index ].username );

      response[1] = 0x03; /* MASK of 0 and LENGTH of 3 */
      response[2] = 'O';
      response[3] = 'K';
      response[4] = newline;
      response[5] = '\0';
      *response_length = 5;
    }
    else
    {
      printf( "Duplicate user: [%s]\n", payload + 6 );

      response[1] = 0x06; /* MASK of 0 and LENGTH of 6 */
      response[2] = 'E';
      response[3] = 'R';
      response[4] = 'R';
      response[5] = 'O';
      response[6] = 'R';
      response[7] = newline;
      response[8] = '\0';
      *response_length = 8;
    }
  }
  else if ( strncmp( payload, "WHO HERE", 8 ) == 0 )
  {
    char allusers[8192];
    int i, first;
    for ( i = 0 ; i < 8192 ; i++ ) { allusers[i] = '\0'; }
    for ( i = 0, first = 1 ; i < chatuser_next_index ; i++ )
    {
      if ( chatusers[i].username != NULL )
      {
        if ( first ) { first = 0; } else { strcat( allusers, "," ); }
        strcat( allusers, chatusers[i].username );
      }
    }
    allusers[ strlen( allusers ) ] = newline;
    allusers[ strlen( allusers ) ] = '\0';

    /* TO DO: add support in server for extended payload */
    if ( strlen( allusers ) > 125 )
    {
      printf( "Whoops! Long frame not supported. Skipping.\n" );
      return 1;
    }

    response[1] = strlen( allusers );
    strcpy( response + 2, allusers );
    *response_length = strlen( allusers ) + 2;
  }
  else if ( strncmp( payload, "SEND ", 5 ) == 0 || strncmp( payload, "BROADCAST", 9 ) == 0 )
  {
    int bc = strncmp( payload, "SEND ", 5 );

    trim_right( payload );

    char username[1024];
    int i, j, k = (bc?9:5);
    for ( i = k ; i < payload_length && payload[i] != newline ; i++ )
    {
      username[i-k] = payload[i];
      username[i-(k-1)] = '\0';
    }

    int orig_username_length = strlen( username );

    /* this code will omit the optional <from-user>, if present */
    for ( i = strlen( username ) - 1 ; i >= 0 ; i-- )
    {
      if ( username[i] == ' ' )
      {
        for ( i++, j = 0 ; i <= strlen( username ) ; i++, j++ )
        {
          username[j] = username[i];
        }
        break;
      }
    }

    if ( bc )
    {
      strcpy( response + 2, "BROADCAST FROM " );
      strcpy( response + 17, chatusers[ chatuser_index ].username );
      strcat( response + 17, payload + 9 + orig_username_length );
      *response_length = strlen( response + 2 ) + 2;
      response[1] = strlen( response + 2 );
      return 2;
    }
    else
    {
      int index = find_chatuser( username );

      if ( index == -1 )
      {
        printf( "Unknown user: [%s]\n", username );

        response[1] = 0x06; /* MASK of 0 and LENGTH of 6 */
        response[2] = 'E';
        response[3] = 'R';
        response[4] = 'R';
        response[5] = 'O';
        response[6] = 'R';
        response[7] = newline;
        response[8] = '\0';
        *response_length = 8;
      }
      else
      {
        printf( "Found user on fd %d\n", chatusers[ index ].fd );
        strcpy( response + 2, "PRIVATE FROM " );
        strcpy( response + 15, chatusers[ chatuser_index ].username );
        strcat( response + 15, payload + 5 + orig_username_length );
        *response_length = strlen( response + 2 ) + 2;
        response[1] = strlen( response + 2 );
        return chatusers[ index ].fd;
      }
    }
  }
  else if ( strncmp( payload, "LOGOUT", 6 ) == 0 )
  {
    return 1;
  }

  return 0;
}

char * do_hash( char * sec_ws_key )
{
#if 0
  strcpy( sec_ws_key, "wTfhMBsUmc9/v6RWgzmLiw==" ); 
  /* expected: TyRLRl5fE8awKtbv4EQl5GSWfcE= */
#endif

  SHA1Context sha;
  SHA1Reset( &sha );

  char * combined = (char *)calloc( 1 + strlen( sec_ws_key ) + strlen( GUID ), sizeof( char ) );
  sprintf( combined, "%s%s", sec_ws_key, GUID );
  printf( "HASHING: [%s]\n", combined );

  SHA1Input( &sha, (const unsigned char *)combined, strlen( combined ) );

  if ( SHA1Result( &sha ) )
  {
    char * result = (char *)calloc( 128, sizeof( char ) );
    result[0] = '\0';

    int i, j;
    for ( i = 0, j = 0 ; i < 5 ; i++ )
    {
      int k;
      char mini[16];
      sprintf( mini, "%08X", sha.Message_Digest[i] );  /* e.g. 99AABBCC */
      for ( k = 0 ; k < 8 ; k += 2 )
      {
        result[j++] = hex_to_digit( mini[k] ) * 16 + hex_to_digit( mini[k+1] );
      }
    }

    int output_length = 28;
    char * x = encode_base64( 20, (unsigned char *)result );
    strncpy( result, x, output_length );
    result[ output_length ] = '\0';
    return result;
  }
  else
  {
    printf( "Error performing do_hash() function\n" );
    return (char *)NULL;
  }
}
